import { useState } from 'react';
import { Plus, Trash2, Clock, Hash } from 'lucide-react';

interface IvrStep {
  type: 'wait' | 'press';
  value: string;
}

interface Props {
  value: string;
  onChange: (sequence: string) => void;
}

function parseSequence(raw: string): IvrStep[] {
  if (!raw) return [];
  const steps: IvrStep[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === 'W') {
      // Count consecutive W's for seconds
      let count = 0;
      while (i < raw.length && raw[i] === 'W') { count++; i++; }
      steps.push({ type: 'wait', value: count.toString() });
    } else if (ch === 'w') {
      let count = 0;
      while (i < raw.length && raw[i] === 'w') { count++; i++; }
      steps.push({ type: 'wait', value: (count * 0.5).toString() });
    } else {
      steps.push({ type: 'press', value: ch });
      i++;
    }
  }
  return steps;
}

function stepsToSequence(steps: IvrStep[]): string {
  return steps
    .map((s) => {
      if (s.type === 'wait') {
        const seconds = parseFloat(s.value) || 1;
        return 'W'.repeat(Math.round(seconds));
      }
      return s.value;
    })
    .join('');
}

export default function IvrBuilder({ value, onChange }: Props) {
  const [steps, setSteps] = useState<IvrStep[]>(() => parseSequence(value));

  const update = (newSteps: IvrStep[]) => {
    setSteps(newSteps);
    onChange(stepsToSequence(newSteps));
  };

  const addStep = (type: 'wait' | 'press') => {
    update([...steps, { type, value: type === 'wait' ? '2' : '1' }]);
  };

  const removeStep = (index: number) => {
    update(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, value: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], value };
    update(newSteps);
  };

  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <div className="text-xs text-gray-600 py-2">No IVR steps — calls will use normal AMD detection.</div>
      )}

      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-5 text-right">{i + 1}.</span>
          {step.type === 'wait' ? (
            <>
              <Clock size={14} className="text-yellow-500 shrink-0" />
              <span className="text-xs text-gray-400 w-10">Wait</span>
              <select
                value={step.value}
                onChange={(e) => updateStep(i, e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm w-24"
              >
                <option value="0.5">0.5 sec</option>
                <option value="1">1 sec</option>
                <option value="2">2 sec</option>
                <option value="3">3 sec</option>
                <option value="4">4 sec</option>
                <option value="5">5 sec</option>
              </select>
            </>
          ) : (
            <>
              <Hash size={14} className="text-emerald-500 shrink-0" />
              <span className="text-xs text-gray-400 w-10">Press</span>
              <select
                value={step.value}
                onChange={(e) => updateStep(i, e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm w-24"
              >
                {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => removeStep(i)}
            className="p-1 text-gray-600 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => addStep('wait')}
          className="flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs transition-colors"
        >
          <Clock size={12} /> Add Wait
        </button>
        <button
          type="button"
          onClick={() => addStep('press')}
          className="flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs transition-colors"
        >
          <Hash size={12} /> Add Press
        </button>
      </div>

      {steps.length > 0 && (
        <div className="text-xs text-gray-600 pt-1">
          Sequence: <code className="bg-gray-800 px-1.5 py-0.5 rounded">{stepsToSequence(steps)}</code>
        </div>
      )}
    </div>
  );
}
