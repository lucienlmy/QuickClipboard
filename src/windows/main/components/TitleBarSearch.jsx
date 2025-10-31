import { IconSearch, IconX } from '@tabler/icons-react'
import { useState, useRef, useEffect } from 'react'
import { useInputFocus } from '@shared/hooks/useInputFocus'

function TitleBarSearch({ value, onChange, placeholder }) {
    const [isFocused, setIsFocused] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const inputRef = useInputFocus()
    const searchRef = useRef(null)

    // 决定是否显示为扩展状态
    const shouldExpand = isFocused || value.length > 0

    useEffect(() => {
        setIsExpanded(shouldExpand)
    }, [shouldExpand])

    const handleIconClick = () => {
        if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }

    const handleFocus = () => {
        setIsFocused(true)
        if (inputRef.current && value) {
            setTimeout(() => {
                inputRef.current.select()
            }, 100)
        }
    }

    const handleClear = () => {
        onChange('')
        if (inputRef.current) {
            inputRef.current.focus()
        }
    }

    return (
        <div
            ref={searchRef}
            className="titlebar-search relative flex items-center justify-end w-8"
        >
            {/* 输入框 - 从图标左侧展开，绝对定位 */}
            <input
                ref={inputRef}
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={handleFocus}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                className={`absolute right-7 h-8 px-2.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-blue-500 dark:focus:border-blue-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 ease-in-out ${isExpanded
                        ? 'w-30 opacity-100 mr-1 pr-7'
                        : 'w-0 opacity-0 pointer-events-none border-0'
                    }`}
            />

            {/* 清空按钮 - 只在有内容时显示 */}
            {value && isExpanded && (
                <button
                    onClick={handleClear}
                    className="absolute right-9 z-20 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="清空"
                >
                    <IconX size={14} />
                </button>
            )}

            {/* 搜索图标 - 始终保持在原位 */}
            <button
                onClick={handleIconClick}
                className="relative z-10 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                title="搜索"
            >
                <IconSearch size={18} />
            </button>
        </div>
    )
}

export default TitleBarSearch

