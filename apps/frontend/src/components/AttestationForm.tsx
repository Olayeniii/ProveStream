import { isAddress, keccak256, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import type { FormEvent } from 'react';
import { useState } from 'react';
import styled from 'styled-components';

export interface AttestationFormValues {
  supplier: Address;
  policyId: bigint;
  proofHash: Hex;
}

interface AttestationFormProps {
  submitting: boolean;
  onSubmit: (values: AttestationFormValues) => void;
}

interface FormErrors {
  supplier?: string;
  policyId?: string;
  proofHash?: string;
}

function parseValues(supplier: string, policyId: string, proofHash: string) {
  const errors: FormErrors = {};

  if (!isAddress(supplier)) {
    errors.supplier = 'Enter a valid EVM address (0x...).';
  }

  const policyIdNumber = Number(policyId);
  if (!policyId.trim() || !Number.isInteger(policyIdNumber) || policyIdNumber < 0) {
    errors.policyId = 'Enter a non-negative whole number.';
  }

  if (!proofHash.trim()) {
    errors.proofHash = 'Enter the evidence text or hash for this attestation.';
  }

  return { errors, policyIdNumber };
}

export function AttestationForm({ submitting, onSubmit }: AttestationFormProps) {
  const [supplier, setSupplier] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [proofHash, setProofHash] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const { errors: validationErrors, policyIdNumber } = parseValues(supplier, policyId, proofHash);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    onSubmit({
      supplier: supplier as Address,
      policyId: BigInt(policyIdNumber),
      proofHash: keccak256(toHex(proofHash)),
    });
  }

  return (
    <Form onSubmit={handleSubmit} noValidate>
      <Field>
        <Label htmlFor="supplier">Supplier Address</Label>
        <Input
          id="supplier"
          placeholder="0x..."
          value={supplier}
          onChange={(event) => setSupplier(event.target.value)}
          disabled={submitting}
        />
        {errors.supplier && <ErrorText>{errors.supplier}</ErrorText>}
      </Field>

      <Field>
        <Label htmlFor="policyId">Policy ID</Label>
        <Input
          id="policyId"
          type="number"
          min={0}
          placeholder="1"
          value={policyId}
          onChange={(event) => setPolicyId(event.target.value)}
          disabled={submitting}
        />
        {errors.policyId && <ErrorText>{errors.policyId}</ErrorText>}
      </Field>

      <Field>
        <Label htmlFor="proofHash">Proof Hash</Label>
        <Input
          id="proofHash"
          placeholder="Evidence text or reference for this attestation"
          value={proofHash}
          onChange={(event) => setProofHash(event.target.value)}
          disabled={submitting}
        />
        <HelpText>Hashed on submit with keccak256 before it&apos;s stored on-chain.</HelpText>
        {errors.proofHash && <ErrorText>{errors.proofHash}</ErrorText>}
      </Field>

      <SubmitButton type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit Attestation'}
      </SubmitButton>
    </Form>
  );
}

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Input = styled.input`
  padding: 12px 14px;
  border-radius: ${(props) => props.theme.radius};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.background};
  color: ${(props) => props.theme.colors.text};
  font-size: 1rem;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.colors.primary};
  }

  &:disabled {
    opacity: 0.6;
  }
`;

const HelpText = styled.span`
  font-size: 0.8rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const ErrorText = styled.span`
  font-size: 0.8rem;
  color: ${(props) => props.theme.colors.error};
`;

const SubmitButton = styled.button`
  margin-top: 8px;
  padding: 14px;
  border-radius: ${(props) => props.theme.radius};
  border: none;
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
