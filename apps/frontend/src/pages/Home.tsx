import { attestationRegistryAbi } from '@provenance-streams/protocol';
import { useState } from 'react';
import styled from 'styled-components';

import type { AttestationFormValues } from '../components/AttestationForm.js';
import { AttestationForm } from '../components/AttestationForm.js';
import type { SubmissionStatus } from '../components/TransactionResult.js';
import { TransactionResult } from '../components/TransactionResult.js';
import type { AppEnv } from '../env.js';
import { connectWallet, getPublicClient } from '../lib/clients.js';

export function Home({ env }: { env: AppEnv }) {
  const [status, setStatus] = useState<SubmissionStatus>({ state: 'idle' });

  async function handleSubmit(values: AttestationFormValues) {
    setStatus({ state: 'pending' });

    try {
      const walletClient = await connectWallet(env);
      const publicClient = getPublicClient(env);

      const hash = await walletClient.writeContract({
        address: env.contractAddress,
        abi: attestationRegistryAbi,
        functionName: 'submitAttestation',
        args: [values.supplier, values.proofHash, values.policyId],
        chain: walletClient.chain,
        account: walletClient.account!,
      });

      setStatus({ state: 'pending', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus({ state: 'success', hash });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Failed to submit attestation.',
      });
    }
  }

  return (
    <Page>
      <Card>
        <Title>Provenance Streams</Title>
        <Subtitle>Submit an attestation to the on-chain registry.</Subtitle>
        <AttestationForm
          submitting={status.state === 'pending'}
          onSubmit={(values) => {
            void handleSubmit(values);
          }}
        />
        <TransactionResult status={status} />
      </Card>
    </Page>
  );
}

const Page = styled.div`
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
`;

const Card = styled.div`
  width: 100%;
  max-width: 480px;
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.radius};
  padding: 32px;
`;

const Title = styled.h1`
  margin: 0 0 4px;
  font-size: 1.5rem;
`;

const Subtitle = styled.p`
  margin: 0 0 28px;
  color: ${(props) => props.theme.colors.textMuted};
  font-size: 0.95rem;
`;
