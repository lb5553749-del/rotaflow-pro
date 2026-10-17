'use strict';

/**
 * Rules de tracks/{token} contra o emulador do Firestore:
 *   npm run test:rules
 * (firebase emulators:exec --only firestore,storage; precisa de Java.)
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, getDocs, collection, deleteDoc, Timestamp } = require('firebase/firestore');

const PROJECT_ID = 'demo-rotaflow-rules';
const TOKEN = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';
const HOUR = 60 * 60 * 1000;

let env;

function expiresIn(ms) {
  return Timestamp.fromMillis(Date.now() + ms);
}

function eventDoc(ownerUid, extra) {
  return {
    destLat: -8.76,
    destLng: -63.9,
    destName: 'Ana',
    sequentialId: 'A1',
    status: 'active',
    motorista: 'João',
    updatedAt: Date.now(),
    nearNotified: false,
    deliveredNotified: false,
    absentNotified: false,
    failReason: '',
    ownerUid,
    expiresAt: expiresIn(48 * HOUR),
    ...(extra || {})
  };
}

function liveDoc(ownerUid, extra) {
  return {
    driverLat: -8.75,
    driverLng: -63.88,
    accuracy: 10,
    updatedAt: Date.now(),
    etaSeconds: 120,
    stopsAhead: 0,
    ownerUid,
    expiresAt: expiresIn(48 * HOUR),
    ...(extra || {})
  };
}

function subDoc() {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuvwxyz',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    createdAt: Date.now()
  };
}

const driver = () => env.authenticatedContext('driver-uid').firestore();
const intruder = () => env.authenticatedContext('intruder-uid').firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seed(path_, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path_), data);
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8')
    }
  });
});

after(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('tracks/{token} — dono autenticado (ownerUid)', () => {
  it('motorista autenticado cria o track com o próprio uid', async () => {
    await assertSucceeds(setDoc(doc(driver(), 'tracks', TOKEN), eventDoc('driver-uid')));
  });

  it('sem auth não cria', async () => {
    await assertFails(setDoc(doc(anon(), 'tracks', TOKEN), eventDoc('driver-uid')));
  });

  it('não cria com ownerUid de outra pessoa', async () => {
    await assertFails(setDoc(doc(intruder(), 'tracks', TOKEN), eventDoc('driver-uid')));
  });

  it('não cria sem ownerUid', async () => {
    const data = eventDoc('driver-uid');
    delete data.ownerUid;
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN), data));
  });

  it('token fora do formato não é aceito', async () => {
    await assertFails(setDoc(doc(driver(), 'tracks', 'nao-e-token'), eventDoc('driver-uid')));
  });

  it('dono atualiza status/flags', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertSucceeds(updateDoc(doc(driver(), 'tracks', TOKEN), {
      status: 'entregue', deliveredNotified: true, updatedAt: Date.now(), expiresAt: expiresIn(24 * HOUR)
    }));
  });

  it('quem só tem o link (sem auth) não marca entregue', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertFails(updateDoc(doc(anon(), 'tracks', TOKEN), { status: 'entregue' }));
  });

  it('outro usuário autenticado não altera nem dispara push falso', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertFails(updateDoc(doc(intruder(), 'tracks', TOKEN), { nearNotified: true }));
    await assertFails(updateDoc(doc(intruder(), 'tracks', TOKEN), { destName: 'Golpe' }));
  });

  it('dono não pode trocar ownerUid', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertFails(updateDoc(doc(driver(), 'tracks', TOKEN), { ownerUid: 'outro' }));
  });

  it('track legado sem ownerUid fica imutável', async () => {
    const legacy = eventDoc('x');
    delete legacy.ownerUid;
    delete legacy.expiresAt;
    legacy.driverLat = -8.7;
    legacy.driverLng = -63.8;
    await seed(`tracks/${TOKEN}`, legacy);
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN), eventDoc('driver-uid'), { merge: true }));
    await assertSucceeds(getDoc(doc(anon(), 'tracks', TOKEN)));
  });

  it('leitura pública pelo token continua (página do cliente)', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertSucceeds(getDoc(doc(anon(), 'tracks', TOKEN)));
  });

  it('ninguém apaga pelo cliente', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertFails(deleteDoc(doc(driver(), 'tracks', TOKEN)));
  });
});

describe('tracks/{token} — retenção (expiresAt)', () => {
  it('exige expiresAt timestamp', async () => {
    const data = eventDoc('driver-uid');
    delete data.expiresAt;
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN), data));
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN), eventDoc('driver-uid', { expiresAt: Date.now() + HOUR })));
  });

  it('recusa expiresAt além de 7 dias', async () => {
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN), eventDoc('driver-uid', { expiresAt: expiresIn(30 * 24 * HOUR) })));
  });

  it('recusa create com expiresAt no passado (track já nasceria expirado)', async () => {
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN), eventDoc('driver-uid', { expiresAt: expiresIn(-HOUR) })));
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertFails(setDoc(doc(driver(), 'tracks', OTHER, 'live', 'pos'), liveDoc('driver-uid', { expiresAt: expiresIn(-HOUR) })));
  });
});

describe('tracks/{token} — posição fica fora do doc de evento', () => {
  it('doc pai não aceita driverLat/etaSeconds (iriam disparar a função a cada GPS)', async () => {
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN), eventDoc('driver-uid', { driverLat: -8.7, driverLng: -63.8 })));
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertFails(updateDoc(doc(driver(), 'tracks', TOKEN), { etaSeconds: 60 }));
  });
});

describe('tracks/{token}/live/pos', () => {
  it('dono cria e atualiza a posição', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertSucceeds(setDoc(doc(driver(), 'tracks', TOKEN, 'live', 'pos'), liveDoc('driver-uid')));
    await assertSucceeds(setDoc(doc(driver(), 'tracks', TOKEN, 'live', 'pos'), liveDoc('driver-uid', { driverLat: -8.74 }), { merge: true }));
  });

  it('leitura pública de live/pos', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await seed(`tracks/${TOKEN}/live/pos`, liveDoc('driver-uid'));
    await assertSucceeds(getDoc(doc(anon(), 'tracks', TOKEN, 'live', 'pos')));
  });

  it('sem auth ou outro uid não move o motorista', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await seed(`tracks/${TOKEN}/live/pos`, liveDoc('driver-uid'));
    await assertFails(setDoc(doc(anon(), 'tracks', TOKEN, 'live', 'pos'), liveDoc('driver-uid', { driverLat: 0 })));
    await assertFails(updateDoc(doc(intruder(), 'tracks', TOKEN, 'live', 'pos'), { driverLat: 0 }));
  });

  it('não cria live/pos em track de outra pessoa (mesmo forjando ownerUid)', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertFails(setDoc(doc(intruder(), 'tracks', TOKEN, 'live', 'pos'), liveDoc('intruder-uid')));
  });

  it('não cria live/pos sem o doc pai', async () => {
    await assertFails(setDoc(doc(driver(), 'tracks', OTHER, 'live', 'pos'), liveDoc('driver-uid')));
  });

  it('só o id "pos", campos permitidos e expiresAt obrigatório', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN, 'live', 'outro'), liveDoc('driver-uid')));
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN, 'live', 'pos'), liveDoc('driver-uid', { status: 'entregue' })));
    const noExp = liveDoc('driver-uid');
    delete noExp.expiresAt;
    await assertFails(setDoc(doc(driver(), 'tracks', TOKEN, 'live', 'pos'), noExp));
  });
});

describe('tracks/{token}/subs', () => {
  it('cliente sem auth grava a inscrição de push', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await assertSucceeds(setDoc(doc(anon(), 'tracks', TOKEN, 'subs', 'sub1'), subDoc()));
    await assertSucceeds(setDoc(doc(anon(), 'tracks', TOKEN, 'subs', 'sub1'), subDoc()));
  });

  it('ninguém lê as inscrições pelo cliente (nem o dono)', async () => {
    await seed(`tracks/${TOKEN}`, eventDoc('driver-uid'));
    await seed(`tracks/${TOKEN}/subs/sub1`, subDoc());
    await assertFails(getDoc(doc(anon(), 'tracks', TOKEN, 'subs', 'sub1')));
    await assertFails(getDocs(collection(anon(), 'tracks', TOKEN, 'subs')));
    await assertFails(getDocs(collection(driver(), 'tracks', TOKEN, 'subs')));
  });

  it('não aceita inscrição em track inexistente', async () => {
    await assertFails(setDoc(doc(anon(), 'tracks', OTHER, 'subs', 'sub1'), subDoc()));
  });
});
