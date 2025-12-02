function TabButton({
  id,
  label,
  icon,
  isActive,
  onClick,
  index,
  buttonRef
}) {
  const handleClick = () => {
    onClick(id);
  };

  return (
    <div ref={buttonRef} className="relative flex-1 h-7">
      <button
        onClick={handleClick}
        title={label}
        className={`
          relative z-10 flex items-center justify-center w-full h-full rounded-lg
          transition-transform transition-colors duration-200
          focus:outline-none hover:scale-105

          ${isActive
            ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
            : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'}
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

export default TabButton;