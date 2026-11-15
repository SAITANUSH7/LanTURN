const MEDAL_CONFIG = {
  gold:   { emoji: '🥇', label: 'Gold',   gradient: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '#f59e0b', text: '#92400e' },
  silver: { emoji: '🥈', label: 'Silver', gradient: 'linear-gradient(135deg, #E8E8E8, #D4D4D4)', border: '#8A8A8A', text: '#475569' },
  bronze: { emoji: '🥉', label: 'Bronze', gradient: 'linear-gradient(135deg, #fed7aa, #fdba74)', border: '#f97316', text: '#9a3412' },
  basic:  { emoji: '🏅', label: 'Basic',  gradient: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', border: '#60a5fa', text: '#1e40af' },
};

export function SkillMedalBadge({ skill, medal, size = 'md' }) {
  const config = MEDAL_CONFIG[medal];
  if (!config) return null;

  const isLarge = size === 'lg';

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full font-medium transition-transform hover:scale-105"
      style={{
        background: config.gradient,
        border: `1.5px solid ${config.border}`,
        color: config.text,
        padding: isLarge ? '6px 14px' : '4px 10px',
        fontSize: isLarge ? '14px' : '12px',
      }}
      title={`${config.label} Medal in ${skill} — earned via Skill Test Arena`}
    >
      <span style={{ fontSize: isLarge ? '16px' : '13px' }}>{config.emoji}</span>
      <span>{skill}</span>
    </div>
  );
}

export { MEDAL_CONFIG };
export default SkillMedalBadge;
