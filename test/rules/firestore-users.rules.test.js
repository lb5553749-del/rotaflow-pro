'use strict';

/**
 * Rules de users/{userId}/** contra o emulador do Firestore:
 *   npm run test:rules
 * (firebase emulators:exec --only firestore,storage; precisa de Java.)
 *
 * A árvore users/{uid}/** guarda os dados do motorista (perfil, entregas,
 * backup) e segue storage.rules: só o dono autenticado lê e escreve.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, getDocs, collection, deleteDoc } = require('firebase/firestore');

// node --test roda cada arquivo em um processo paralelo; projectId próprio por
// arquivo isola o clearFirestore() (que só limpa o projeto informado).
const PROJECT_ID = 'demo-rotaflow-rules-users';

let env;

function profileDoc(extra) {
  return {
    nome: 'João',
    email: 'joao@example.com',
    updatedAt: Date.now(),
    ...(extra || {})
  };
}

function deliveryDoc(extra) {
  return {
    destLat: -8.76,
    destLng: -63.9,
    destName: 'Ana',
    status: 'pendente',
    updatedAt: Date.now(),
    ...(extra || {})
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

describe('users/{userId} — dono autenticado', () => {
  it('dono cria, lê, atualiza e apaga o próprio doc', async () => {
    await assertSucceeds(setDoc(doc(driver(), 'users', 'driver-uid'), profileDoc()));
    await assertSucceeds(getDoc(doc(driver(), 'users', 'driver-uid')));
    await assertSucceeds(updateDoc(doc(driver(), 'users', 'driver-uid'), { nome: 'João Silva' }));
    await assertSucceeds(deleteDoc(doc(driver(), 'users', 'driver-uid')));
  });

  it('ninguém lista a coleção users inteira (userId varia por doc)', async () => {
    await seed('users/driver-uid', profileDoc());
    await assertFails(getDocs(collection(driver(), 'users')));
    await assertFails(getDocs(collection(intruder(), 'users')));
    await assertFails(getDocs(collection(anon(), 'users')));
  });
});

describe('users/{userId} — acesso negado', () => {
  it('outro usuário autenticado não lê nem escreve', async () => {
    await seed('users/driver-uid', profileDoc());
    await assertFails(getDoc(doc(intruder(), 'users', 'driver-uid')));
    await assertFails(setDoc(doc(intruder(), 'users', 'driver-uid'), profileDoc({ nome: 'Golpe' })));
    await assertFails(updateDoc(doc(intruder(), 'users', 'driver-uid'), { nome: 'Golpe' }));
    await assertFails(deleteDoc(doc(intruder(), 'users', 'driver-uid')));
  });

  it('anônimo não lê nem escreve', async () => {
    await seed('users/driver-uid', profileDoc());
    await assertFails(getDoc(doc(anon(), 'users', 'driver-uid')));
    await assertFails(setDoc(doc(anon(), 'users', 'driver-uid'), profileDoc()));
    await assertFails(updateDoc(doc(anon(), 'users', 'driver-uid'), { nome: 'Golpe' }));
    await assertFails(deleteDoc(doc(anon(), 'users', 'driver-uid')));
  });
});

describe('users/{userId}/deliveries/{id} — subcoleção aninhada', () => {
  it('dono escreve, lê e lista as próprias entregas', async () => {
    await assertSucceeds(setDoc(doc(driver(), 'users', 'driver-uid', 'deliveries', 'ent-1'), deliveryDoc()));
    await assertSucceeds(getDoc(doc(driver(), 'users', 'driver-uid', 'deliveries', 'ent-1')));
    await assertSucceeds(getDocs(collection(driver(), 'users', 'driver-uid', 'deliveries')));
  });

  it('outro usuário autenticado é negado na subcoleção', async () => {
    await seed('users/driver-uid/deliveries/ent-1', deliveryDoc());
    await assertFails(getDoc(doc(intruder(), 'users', 'driver-uid', 'deliveries', 'ent-1')));
    await assertFails(setDoc(doc(intruder(), 'users', 'driver-uid', 'deliveries', 'ent-2'), deliveryDoc()));
    await assertFails(getDocs(collection(intruder(), 'users', 'driver-uid', 'deliveries')));
  });

  it('anônimo é negado na subcoleção', async () => {
    await seed('users/driver-uid/deliveries/ent-1', deliveryDoc());
    await assertFails(getDoc(doc(anon(), 'users', 'driver-uid', 'deliveries', 'ent-1')));
    await assertFails(setDoc(doc(anon(), 'users', 'driver-uid', 'deliveries', 'ent-2'), deliveryDoc()));
  });
});
