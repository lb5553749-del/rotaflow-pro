'use strict';

/**
 * Rules de Storage (users/{uid}/photos, users/{uid}/backups e o catch-all
 * image-only) contra o emulador do Storage:
 *   npm run test:rules
 * (firebase emulators:exec --only firestore,storage; precisa de Java.)
 *
 * @firebase/rules-unit-testing 5.x suporta o emulador de Storage; o contexto
 * devolve o SDK compat (ctx.storage()), por isso ref/put/getDownloadURL.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');

// node --test roda cada arquivo em um processo paralelo; projectId próprio por
// arquivo isola o clearStorage()/clearFirestore() entre as suítes.
const PROJECT_ID = 'demo-rotaflow-rules-storage';
const MB = 1024 * 1024;

let env;

const png = (size) => Buffer.alloc(size, 0x89);
const pngMeta = { contentType: 'image/png' };
const jsonMeta = { contentType: 'application/json' };

const driver = () => env.authenticatedContext('driver-uid').storage();
const intruder = () => env.authenticatedContext('intruder-uid').storage();
const anon = () => env.unauthenticatedContext().storage();

async function seed(path_, data, metadata) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(path_).put(data, metadata);
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'storage.rules'), 'utf8')
    }
  });
});

after(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
});

describe('users/{uid}/photos — dono autenticado', () => {
  it('dono sobe e lê a própria foto', async () => {
    const ref = driver().ref('users/driver-uid/photos/entrega-1.png');
    await assertSucceeds(ref.put(png(1024), pngMeta));
    await assertSucceeds(driver().ref('users/driver-uid/photos/entrega-1.png').getDownloadURL());
  });

  it('recusa foto acima de 5 MB', async () => {
    await assertFails(driver().ref('users/driver-uid/photos/grande.png').put(png(5 * MB + 1), pngMeta));
  });

  it('recusa arquivo que não é imagem', async () => {
    await assertFails(driver().ref('users/driver-uid/photos/notas.txt').put(png(64), { contentType: 'text/plain' }));
  });
});

describe('users/{uid}/backups — dono autenticado', () => {
  it('dono sobe e lê o próprio backup JSON', async () => {
    await assertSucceeds(driver().ref('users/driver-uid/backups/backup.json').put(png(1024), jsonMeta));
    await assertSucceeds(driver().ref('users/driver-uid/backups/backup.json').getDownloadURL());
  });

  it('recusa backup acima de 4 MB', async () => {
    await assertFails(driver().ref('users/driver-uid/backups/backup.json').put(png(4 * MB + 1), jsonMeta));
  });

  it('recusa backup com contentType errado', async () => {
    await assertFails(driver().ref('users/driver-uid/backups/backup.json').put(png(64), { contentType: 'text/plain' }));
  });
});

describe('users/{uid}/** — path legado image-only', () => {
  it('dono sobe imagem em path legado', async () => {
    await assertSucceeds(driver().ref('users/driver-uid/avatar/perfil.png').put(png(1024), pngMeta));
  });

  it('path legado continua image-only', async () => {
    await assertFails(driver().ref('users/driver-uid/docs/relatorio.pdf').put(png(64), { contentType: 'application/pdf' }));
  });
});

describe('Storage — acesso negado', () => {
  it('outro usuário autenticado não lê nem escreve no espaço alheio', async () => {
    await seed('users/driver-uid/photos/entrega-1.png', png(64), pngMeta);
    await assertFails(intruder().ref('users/driver-uid/photos/entrega-1.png').getDownloadURL());
    await assertFails(intruder().ref('users/driver-uid/photos/golpe.png').put(png(64), pngMeta));
    await assertFails(intruder().ref('users/driver-uid/backups/backup.json').put(png(64), jsonMeta));
  });

  it('anônimo não lê nem escreve', async () => {
    await seed('users/driver-uid/photos/entrega-1.png', png(64), pngMeta);
    await assertFails(anon().ref('users/driver-uid/photos/entrega-1.png').getDownloadURL());
    await assertFails(anon().ref('users/driver-uid/photos/golpe.png').put(png(64), pngMeta));
  });
});
