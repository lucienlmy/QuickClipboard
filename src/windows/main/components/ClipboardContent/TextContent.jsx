// 文本内容组件
function TextContent({
  content,
  lineClampClass
}) {
  return <p className={`text-sm text-gray-800 dark:text-gray-200 break-all leading-relaxed ${lineClampClass}`}>
      {content}
    </p>;
}
export default TextContent;