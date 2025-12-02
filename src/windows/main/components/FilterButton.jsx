function FilterButton({ id, label, icon, isActive, onClick, buttonRef }) {
  const handleClick = () => {
    onClick(id);
  };

  return (
    <div ref={buttonRef} className="relative w-7 h-7">
      <button
        onClick={handleClick}
        title={label}
        className={`relative z-10 flex items-center justify-center w-full h-full rounded-lg
          focus:outline-none active:scale-95 hover:scale-105
          ${isActive
            ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}
        `}
        style={{
          transitionProperty: 'transform, box-shadow, background-color, color',
          transitionDuration: '200ms, 200ms, 500ms, 500ms'
        }}
      >
        <i className={icon} style={{ fontSize: 16 }} />
      </button>
    </div>
  );
}

export default FilterButton;