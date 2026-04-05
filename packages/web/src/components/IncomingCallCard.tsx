import { Phone, Building2, StickyNote } from 'lucide-react';

interface RoutedCall {
  callControlId: string;
  contactId: number;
  contactName: string | null;
  contactPhone: string;
  contactCompany: string | null;
  contactNotes: string | null;
}

interface Props {
  routedCall: RoutedCall;
}

export default function IncomingCallCard({ routedCall }: Props) {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-gray-800 border-2 border-emerald-500/50 rounded-xl p-6 shadow-lg shadow-emerald-500/10">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-emerald-500/20 rounded-full animate-pulse">
            <Phone size={20} className="text-emerald-400" />
          </div>
          <div className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">
            Call Connected
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xl font-bold truncate">
            {routedCall.contactName || 'Unknown Contact'}
          </div>

          <div className="text-lg text-gray-300 font-mono">{routedCall.contactPhone}</div>

          {routedCall.contactCompany && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Building2 size={14} className="shrink-0" />
              <span className="truncate">{routedCall.contactCompany}</span>
            </div>
          )}

          {routedCall.contactNotes && (
            <div className="flex items-start gap-2 text-sm text-gray-500">
              <StickyNote size={14} className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">{routedCall.contactNotes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
