import { CircleDollarSign, FileText, Hash, Radio } from 'lucide-react';
import styled from 'styled-components';

import { UsdcIcon } from '../UsdcIcon.js';
import { formatReward } from '../../lib/format.js';
import type { Stream } from '../../lib/streams.js';
import { getOverallStatus } from '../../lib/streams.js';

export function RewardMetricsStrip({ stream }: { stream: Stream }) {
  const status = getOverallStatus(stream);

  return (
    <Strip>
      <Cell>
        <IconBadge>
          <CircleDollarSign size={18} />
        </IconBadge>
        <div>
          <CellLabel>Reward Amount</CellLabel>
          <CellValue>
            {stream.payment ? (
              <>
                <UsdcIcon /> {formatReward(stream.payment.rewardAmount)}
              </>
            ) : (
              '—'
            )}
          </CellValue>
        </div>
      </Cell>
      <Cell>
        <IconBadge>
          <FileText size={18} />
        </IconBadge>
        <div>
          <CellLabel>Policy</CellLabel>
          <CellValue>
            {stream.policy?.credentialType ?? `#${stream.attestation.policyId}`}
          </CellValue>
        </div>
      </Cell>
      <Cell>
        <IconBadge>
          <Hash size={18} />
        </IconBadge>
        <div>
          <CellLabel>Attestation ID</CellLabel>
          <CellValue>#{stream.attestation.id}</CellValue>
        </div>
      </Cell>
      <Cell>
        <IconBadge>
          <Radio size={18} />
        </IconBadge>
        <div>
          <CellLabel>Status</CellLabel>
          <CellValue>{status.label}</CellValue>
        </div>
      </Cell>
    </Strip>
  );
}

const Strip = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  padding: 16px;
  border-radius: ${(props) => props.theme.radius.card};
  background: ${(props) => props.theme.colors.surfaceMuted};
`;

const Cell = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const IconBadge = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 999px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.theme.colors.primary}1a;
  color: ${(props) => props.theme.colors.primary};
`;

const CellLabel = styled.div`
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(props) => props.theme.colors.textMuted};
`;

const CellValue = styled.div`
  font-size: 0.88rem;
  font-weight: 600;
  color: ${(props) => props.theme.colors.text};
`;
