export default function IncrementDecrementButtons({ onIncrement, onDecrement }) {
  return (
    <div className="flex flex-col -space-y-px">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onIncrement?.();
        }}
        className="flex items-center justify-center h-2.5 w-4 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 active:scale-95"
      >
        <svg
          width="6"
          height="3"
          viewBox="0 0 6 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 2.5L3 0.5L5 2.5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onDecrement?.();
        }}
        className="flex items-center justify-center h-2.5 w-4 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 active:scale-95"
      >
        <svg
          width="6"
          height="3"
          viewBox="0 0 6 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 0.5L3 2.5L5 0.5" />
        </svg>
      </button>
    </div>
  );
}
