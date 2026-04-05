import type { OperatorStatus } from '../types';
import { Users, Clock } from 'lucide-react';

const availabilityConfig: Record<string, { color: string; label: string; pulse?: boolean }> = {
  available: { color: 'bg-emerald-500', label: 'Available' },
  on_call: { color: 'bg-red-500', label: 'On Call', pulse: true },
  wrap_up: { color: 'bg-yellow-500', label: 'Wrap-Up' },
  offline: { color: 'bg-gray-500', label: 'Offline' },
};

interface Props {
  operators: OperatorStatus[];
  waitingCalls: number;
}

export default function OperatorStatusPanel({ operators, waitingCalls }: Props) {
  return (
    <div className="border-b border-gray-800">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <Users size={14} />
          Operators ({operators.length})
        </div>
        {waitingCalls > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
            <Clock size={12} />
            {waitingCalls} waiting
          </div>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {operators.map((op) => {
          const cfg = availabilityConfig[op.availability] || availabilityConfig.offline;
          return (
            <div
              key={op.userId}
              className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/50"
            >
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{op.name}</div>
                <div className="text-xs text-gray-500">
                  {cfg.label}
                  {op.availability === 'on_call' && op.bridgedContactId && (
                    <span className="ml-1 text-gray-600">· Contact #{op.bridgedContactId}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {operators.length === 0 && (
          <div className="p-4 text-sm text-gray-600 text-center">No operators online</div>
        )}
      </div>
    </div>
  );
}
