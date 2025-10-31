import { IconSearch } from '@tabler/icons-react'
import { useState, useRef, useEffect } from 'react'
import { useInputFocus } from '@shared/hooks/useInputFocus'

function TitleBarSearch({ value, onChange, placeholder }) {
    const [isFocused, setIsFocused] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const inputRef = useInputFocus()
    const searchRef = useRef(null)
    
    // 搜索框清空按钮样式
    const searchInputStyle = `
        .titlebar-search input[type="search"]::-webkit-search-cancel-button {
            -webkit-appearance: none;
            appearance: none;
            height: 14px;
            width: 14px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E");
            background-size: 14px 14px;
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.2s;
        }
        .titlebar-search input[type="search"]::-webkit-search-cancel-button:hover {
            opacity: 1;
        }
    `

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

    return (
        <>
            <style>{searchInputStyle}</style>
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
                className={`absolute right-6 h-7 px-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300/50 dark:border-gray-600/50 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-blue-500 dark:focus:border-blue-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 ease-in-out shadow-sm ${isExpanded
                        ? 'w-30 opacity-100 mr-1'
                        : 'w-0 opacity-0 pointer-events-none border-0'
                    }`}
            />

            {/* 搜索图标 - 始终保持在原位 */}
            <button
                onClick={handleIconClick}
                className="relative z-10 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/80 dark:hover:bg-gray-700/60 hover:shadow-sm hover:scale-105 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all duration-200"
                title="搜索"
            >
                <IconSearch size={16} />
            </button>
        </div>
        </>
    )
}

export default TitleBarSearch

