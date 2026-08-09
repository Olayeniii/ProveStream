import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';

try {
  process.loadEnvFile();
} catch {
  // ignore
}

async function main() {
  const client = initiateUserControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY! });

  const tokenResponse = await client.createUserToken({ userId: 'ifeola997@gmail.com' });
  const userToken = tokenResponse.data?.userToken;
  if (!userToken) {
    throw new Error('no user token');
  }
  console.log('got userToken for ifeola997@gmail.com');

  const txList = await client.listTransactions({
    userToken,
    pageSize: 10,
  });
  console.log(JSON.stringify(txList.data, null, 2));
}

main().catch((error: unknown) => {
  console.error('DIAG ERROR:', error);
});
