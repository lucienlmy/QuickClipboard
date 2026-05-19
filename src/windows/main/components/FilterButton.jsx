import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import Tooltip from '@shared/components/common/Tooltip.jsx';

function FilterButton({
  id,
  label,
  icon,
  isActive,
  onClick,
  buttonRef,
  tooltipPlacement = 'bottom',
  stretch = false
}) {
  const settings = useSnapshot(settingsStore);
  const uiAnimationEnabled = settings.uiAnimationEnabled !== false;

  const handleClick = () => {
    onClick(id);
  };

  return (
    <div
      ref={buttonRef}
      className={`relative h-7 ${stretch ? 'flex-1 min-w-0' : 'w-7 shrink-0'}`}
    >
      <Tooltip content={label} placement={tooltipPlacement} asChild>
        <button
          onClick={handleClick}
          className={`relative z-10 flex items-center justify-center w-full h-full rounded-lg
            focus:outline-none
            ${uiAnimationEnabled ? 'active:scale-95 hover:scale-105' : ''}
            ${isActive
              ? 'qc-active-icon-button bg-[var(--qc-accent)] text-[var(--qc-accent-fg)] shadow-md hover:bg-[var(--qc-accent)]'
              : 'text-qc-fg-muted hover:bg-qc-hover'}
          `}
          style={uiAnimationEnabled ? {
            transitionProperty: 'transform, box-shadow, background-color, color',
            transitionDuration: '200ms, 200ms, 500ms, 500ms'
          } : {}}
        >
          <i className={icon} style={{ fontSize: 16 }} />
        </button>
      </Tooltip>
    </div>
  );
}

export default FilterButton;
