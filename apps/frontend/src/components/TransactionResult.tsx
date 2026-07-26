import styled from 'styled-components';

export type SubmissionStatus =
  | { state: 'idle' }
  | { state: 'pending'; hash?: `0x${string}` }
  | { state: 'success'; hash: `0x${string}` }
  | { state: 'error'; message: string };

export function TransactionResult({ status }: { status: SubmissionStatus }) {
  if (status.state === 'idle') {
    return null;
  }

  if (status.state === 'error') {
    return <ErrorBox role="alert">{status.message}</ErrorBox>;
  }

  if (status.state === 'pending') {
    return (
      <PendingBox>
        Waiting for confirmation…
        {status.hash && <Hash>{status.hash}</Hash>}
      </PendingBox>
    );
  }

  return (
    <SuccessBox role="status">
      <strong>Attestation submitted successfully.</strong>
      <Hash>{status.hash}</Hash>
    </SuccessBox>
  );
}

const Box = styled.div`
  margin-top: 24px;
  padding: 16px;
  border-radius: ${(props) => props.theme.radius};
  border: 1px solid ${(props) => props.theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SuccessBox = styled(Box)`
  border-color: ${(props) => props.theme.colors.success};
`;

const ErrorBox = styled(Box)`
  border-color: ${(props) => props.theme.colors.error};
  color: ${(props) => props.theme.colors.error};
`;

const PendingBox = styled(Box)`
  color: ${(props) => props.theme.colors.textMuted};
`;

const Hash = styled.code`
  font-size: 0.85rem;
  word-break: break-all;
  color: ${(props) => props.theme.colors.textMuted};
`;
