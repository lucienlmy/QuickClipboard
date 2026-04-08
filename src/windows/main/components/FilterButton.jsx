import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import Tooltip from '@shared/components/common/Tooltip.jsx';

function FilterButton({ id, label, icon, isActive, onClick, buttonRef, tooltipPlacement = 'bottom' }) {
  const settings = useSnapshot(settingsStore);
  const uiAnimationEnabled = settings.uiAnimationEnabled !== false;

  const handleClick = () => {
    onClick(id);
  };

  return (
    <div ref={buttonRef} className="relative w-7 h-7 shrink-0">
      <Tooltip content={label} placement={tooltipPlacement} asChild>
        <button
          onClick={handleClick}
          className={`relative z-10 flex items-center justify-center w-full h-full rounded-lg
            focus:outline-none
            ${uiAnimationEnabled ? 'active:scale-95 hover:scale-105' : ''}
            ${isActive
              ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
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
