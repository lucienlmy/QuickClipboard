import * as Switch from '@radix-ui/react-switch'

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className="w-11 h-6 bg-gray-300 dark:bg-gray-600 rounded-full relative transition-colors duration-200 data-[state=checked]:bg-blue-500 dark:data-[state=checked]:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-200 transform translate-x-0.5 data-[state=checked]:translate-x-[22px] shadow-md" />
    </Switch.Root>
  )
}

export default Toggle

