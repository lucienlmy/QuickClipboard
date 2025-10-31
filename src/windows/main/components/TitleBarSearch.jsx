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
            className="titlebar-search relative flex items-center justify-end w-7"
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
                className={`absolute right-6 h-7 px-2 text-sm bg-white/80 dark:bg-gray-700/60 border border-gray-300/50 dark:border-gray-600/50 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-blue-500 dark:focus:border-blue-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 ease-in-out shadow-sm ${isExpanded
                        ? 'w-30 opacity-100 mr-1 pr-5'
                        : 'w-0 opacity-0 pointer-events-none border-0'
                    }`}
            />

            {/* 清空按钮 - 只在有内容时显示 */}
            {value && isExpanded && (
                <button
                    onClick={handleClear}
                    className="absolute right-8 z-20 w-4 h-4 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="清空"
                >
                    <IconX size={12} />
                </button>
            )}

            {/* 搜索图标 - 始终保持在原位 */}
            <button
                onClick={handleIconClick}
                className="relative z-10 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/80 dark:hover:bg-gray-700/60 hover:shadow-sm hover:scale-105 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all duration-200"
                title="搜索"
            >
                <IconSearch size={16} />
            </button>
        </div>
    )
}

export default TitleBarSearch

