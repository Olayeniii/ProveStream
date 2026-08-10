/**
 * One-time (or occasional) operational setup: deposits USDC from the
 * treasury into Circle Gateway's `GatewayWallet` on Arc testnet, so
 * `X402Service` has an actual Gateway balance to burn from. Not part of the
 * agent's runtime — run manually before testing/demoing the x402 payout
 * path, same category as `scripts/deploy.ts` at the repo root.
 *
 * Usage: `npm run deposit-to-gateway --workspace=agent -- <amount-in-usdc>`
 * (defaults to depositing 5 USDC if no amount is given).
 *
 * Reads the same env vars as the backend (`RPC_URL`, `CHAIN_ID`, plus either
 * `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET`/`CIRCLE_TREASURY_WALLET_ID`/
 * `CIRCLE_TREASURY_BLOCKCHAIN` or `TREASURY_PRIVATE_KEY`) so it always talks
 * to the same treasury the running agent uses.
 */
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { parseUnits } from 'viem';
import { createAgentPublicClient, createAgentWalletClient } from '../src/chainClient.js';
/** Verified on-chain against Arc testnet tonight — see `x402Service.ts` for the full verification. */
const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const ARC_TESTNET_USDC_ERC20 = '0x3600000000000000000000000000000000000000';
try {
    process.loadEnvFile();
}
catch {
    // No .env file present; fall back to whatever is already in process.env.
}
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var ${name}.`);
    }
    return value;
}
async function depositViaCircle(amount) {
    const client = initiateDeveloperControlledWalletsClient({
        apiKey: requireEnv('CIRCLE_API_KEY'),
        entitySecret: requireEnv('CIRCLE_ENTITY_SECRET'),
    });
    const walletId = requireEnv('CIRCLE_TREASURY_WALLET_ID');
    const blockchain = requireEnv('CIRCLE_TREASURY_BLOCKCHAIN');
    const wallet = await client.getWallet({ id: walletId });
    const walletAddress = wallet.data?.wallet?.address;
    if (!walletAddress) {
        throw new Error(`Could not resolve the address of treasury wallet ${walletId}.`);
    }
    console.log(`Approving GatewayWallet to spend ${amount.toString()} (atomic units) of USDC...`);
    const approveTx = await client.createContractExecutionTransaction({
        walletAddress,
        blockchain,
        contractAddress: ARC_TESTNET_USDC_ERC20,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [GATEWAY_WALLET_ADDRESS, amount.toString()],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    console.log('Approve tx submitted:', approveTx.data?.id);
    console.log('Depositing into GatewayWallet...');
    const depositTx = await client.createContractExecutionTransaction({
        walletAddress,
        blockchain,
        contractAddress: GATEWAY_WALLET_ADDRESS,
        abiFunctionSignature: 'deposit(address,uint256)',
        abiParameters: [ARC_TESTNET_USDC_ERC20, amount.toString()],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    console.log('Deposit tx submitted:', depositTx.data?.id);
    console.log("Both transactions are async on Circle's side — check their status via the Circle console " +
        'or `client.getTransaction` before assuming funds are usable. Deposits also need to finalize ' +
        'on-chain before Gateway recognizes the balance (see developers.circle.com/gateway).');
}
async function depositViaLocalSigner(amount) {
    const rpcUrl = requireEnv('RPC_URL');
    const chainId = Number(requireEnv('CHAIN_ID'));
    const privateKey = requireEnv('TREASURY_PRIVATE_KEY');
    const chainConfig = { rpcUrl, chainId };
    const walletClient = createAgentWalletClient({ ...chainConfig, privateKey });
    const publicClient = createAgentPublicClient(chainConfig);
    const erc20Abi = [
        {
            type: 'function',
            name: 'approve',
            inputs: [
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
            ],
            outputs: [{ type: 'bool' }],
            stateMutability: 'nonpayable',
        },
    ];
    const gatewayWalletAbi = [
        {
            type: 'function',
            name: 'deposit',
            inputs: [
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
            ],
            outputs: [],
            stateMutability: 'nonpayable',
        },
    ];
    console.log(`Approving GatewayWallet to spend ${amount.toString()} (atomic units) of USDC...`);
    const approveHash = await walletClient.writeContract({
        address: ARC_TESTNET_USDC_ERC20,
        abi: erc20Abi,
        functionName: 'approve',
        args: [GATEWAY_WALLET_ADDRESS, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log('Approve confirmed:', approveHash);
    console.log('Depositing into GatewayWallet...');
    const depositHash = await walletClient.writeContract({
        address: GATEWAY_WALLET_ADDRESS,
        abi: gatewayWalletAbi,
        functionName: 'deposit',
        args: [ARC_TESTNET_USDC_ERC20, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositHash });
    console.log('Deposit confirmed:', depositHash);
    console.log('Note: Gateway still needs the deposit to finalize before recognizing the balance.');
}
async function main() {
    const amountUsdc = process.argv[2] ?? '5';
    const amount = parseUnits(amountUsdc, 6); // Arc's USDC ERC-20 interface is 6 decimals.
    if (process.env.CIRCLE_API_KEY) {
        await depositViaCircle(amount);
    }
    else {
        await depositViaLocalSigner(amount);
    }
}
main().catch((error) => {
    console.error('Deposit failed:', error);
    process.exitCode = 1;
});
