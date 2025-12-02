import { useTranslation } from 'react-i18next';
import { focusWindowImmediately, restoreFocus } from '@shared/hooks/useInputFocus';

function RenameDialog({ value, onChange, onConfirm, onCancel }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[199]" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-72">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          {t('common.rename') || '重命名'}
        </h3>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          onFocus={focusWindowImmediately}
          onBlur={restoreFocus}
          autoFocus
          className="w-full h-9 px-3 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {t('common.cancel') || '取消'}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            {t('common.confirm') || '确定'}
          </button>
        </div>
      </div>
    </>
  );
}

export default RenameDialog;
