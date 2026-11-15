import { useState, useRef, useCallback } from 'react';
import { X, Plus } from 'lucide-react';

export function SkillsInput({ value = [], onChange, placeholder = 'Add a skill...' }) {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef(null);

  const addSkill = useCallback((raw) => {
    const skill = raw.trim().toLowerCase();
    if (!skill || value.includes(skill)) return;
    onChange([...value, skill]);
    setInputVal('');
  }, [value, onChange]);

  const removeSkill = useCallback((skill) => {
    onChange(value.filter((s) => s !== skill));
  }, [value, onChange]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && value.length > 0) {
      removeSkill(value[value.length - 1]);
    }
  };

  return (
    <div
      className="min-h-[44px] w-full rounded-lg border-0 px-3 py-2 bg-white ring-1 ring-inset ring-brand-200 focus-within:ring-2 focus-within:ring-brand-500 flex flex-wrap gap-1.5 items-center cursor-text transition-shadow"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((skill) => (
        <span key={skill} className="pill group">
          {skill}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeSkill(skill); }}
            className="pill-remove"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => inputVal.trim() && addSkill(inputVal)}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] border-0 bg-transparent p-0 text-sm text-brand-900 placeholder:text-brand-400 focus:ring-0 outline-none"
      />
      {inputVal && (
        <button
          type="button"
          onClick={() => addSkill(inputVal)}
          className="text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
