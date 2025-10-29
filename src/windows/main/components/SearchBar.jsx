import { IconSearch, IconMenu2, IconCheck } from '@tabler/icons-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'

function SearchBar({ value, onChange, placeholder }) {
  const settings = useSnapshot(settingsStore)

  const rowHeightOptions = [
    { value: 'large', label: '大', height: '120px' },
    { value: 'medium', label: '中', height: '90px' },
    { value: 'small', label: '小', height: '50px' }
  ]

  return (
    <div className="flex-shrink-0 px-2.5 py-2 bg-white dark:bg-gray-800">
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <IconSearch 
            size={14} 
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-8 pr-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-blue-500 dark:focus:border-blue-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-shadow"
          />
        </div>

        {/* 行高菜单 */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button 
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
              title="行高"
            >
              <IconMenu2 size={16} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[120px] bg-white dark:bg-gray-800 rounded-lg p-1 shadow-lg border border-gray-200 dark:border-gray-700"
              sideOffset={5}
              align="end"
            >
              <div className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                行高
              </div>
              <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
              
              {rowHeightOptions.map(option => (
                <DropdownMenu.Item
                  key={option.value}
                  onClick={() => settingsStore.setRowHeight(option.value)}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm outline-none cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                >
                  <span>{option.label}</span>
                  {settings.rowHeight === option.value && (
                    <IconCheck size={14} className="text-blue-500" />
                  )}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  )
}

export default SearchBar

