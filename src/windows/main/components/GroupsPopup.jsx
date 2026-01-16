import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useSnapshot } from 'valtio';
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { groupsStore, reorderGroups } from '@shared/store/groupsStore';
import { settingsStore } from '@shared/store/settingsStore';
import { showConfirm, showError } from '@shared/utils/dialog';
import GroupModal from './GroupModal';

const SortableGroupItem = ({ group, isActive, onSelect, onEdit, onDelete, t }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: group.name,
    disabled: group.name === '全部'
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(group.name)}
      className="group relative"
    >
      <div className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-all ${
        isActive 
          ? 'bg-blue-500 text-white' 
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
      } ${isDragging ? 'shadow-lg rounded bg-white dark:bg-gray-800' : ''}`}>
        {/* 拖拽手柄 */}
        <div
          {...attributes}
          {...listeners}
          className={`flex-shrink-0 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-70 ${
            isActive ? 'opacity-50 hover:opacity-80' : ''
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <i className="ti ti-grip-vertical" style={{ fontSize: 10 }}></i>
        </div>

        {/* 图标 */}
        <div className="flex-shrink-0">
          <i className={group.icon} style={{ fontSize: 12, color: isActive ? undefined : (group.color || '#dc2626') }}></i>
        </div>

        {/* 名称 */}
        <div className="flex-1 text-[11px] font-medium truncate">
          {group.name}
        </div>
      </div>

      {/* 操作按钮 */}
      {group.name !== '全部' && !isDragging && (
        <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
          isActive ? 'opacity-100' : ''
        }`}>
          <button
            onClick={(e) => onEdit(e, group)}
            className={`p-0.5 rounded transition-all ${
              isActive
                ? 'bg-white/20 hover:bg-white/30'
                : 'hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title={t('groups.edit')}
          >
            <i className="ti ti-edit" style={{ fontSize: 10 }}></i>
          </button>
          <button
            onClick={(e) => onDelete(e, group.name)}
            className={`p-0.5 rounded transition-all ${
              isActive
                ? 'bg-white/20 hover:bg-red-400/50'
                : 'hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/50'
            }`}
            title={t('groups.delete')}
          >
            <i className="ti ti-trash" style={{ fontSize: 10 }}></i>
          </button>
        </div>
      )}
    </div>
  );
};

const GroupsPopup = forwardRef(({
  activeTab,
  onTabChange,
  onGroupChange
}, ref) => {
  const { t } = useTranslation();
  const groups = useSnapshot(groupsStore);
  const settings = useSnapshot(settingsStore);
  const uiAnimationEnabled = settings.uiAnimationEnabled !== false;
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const closeTimerRef = useRef(null);
  const animationTimerRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // 清理定时器
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, []);

  // 关闭面板（带动画）
  const handleClose = () => {
    if (isPinned) return;
    setIsClosing(true);
    animationTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 200);
  };

  // 切换弹出状态
  const togglePopup = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(!isOpen);
  };

  // 切换固定状态
  const togglePin = e => {
    if (e) {
      e.stopPropagation();
    }
    setIsPinned(!isPinned);
  };

  // 临时显示分组面板
  const showTemporarily = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!isOpen) {
      setIsOpen(true);
    }
    if (!isPinned) {
      closeTimerRef.current = setTimeout(() => {
        handleClose();
      }, 500);
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    togglePin: () => togglePin(null),
    showTemporarily
  }));

  // 鼠标进入触发区或面板
  const handleMouseEnter = () => {
    if (isClosing) {
      return;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  // 鼠标离开触发区或面板
  const handleMouseLeave = () => {
    if (!isPinned && isOpen && !isClosing) {
      closeTimerRef.current = setTimeout(() => {
        handleClose();
      }, 150);
    }
  };

  // 选择分组
  const handleSelectGroup = groupName => {
    groupsStore.setCurrentGroup(groupName);
    if (activeTab !== 'favorites') {
      if (onTabChange) {
        onTabChange('favorites');
      }
    }
    if (onGroupChange) {
      onGroupChange(groupName);
    }
    handleClose();
  };

  // 显示新增分组模态框
  const handleAddGroup = e => {
    e.stopPropagation();
    setEditingGroup(null);
    setShowModal(true);
  };

  // 显示编辑分组模态框
  const handleEditGroup = (e, group) => {
    e.stopPropagation();
    setEditingGroup(group);
    setShowModal(true);
  };

  // 删除分组
  const handleDeleteGroup = async (e, groupName) => {
    e.stopPropagation();
    const confirmed = await showConfirm(t('groups.confirmDelete', { name: groupName }), t('common.confirm'));
    if (!confirmed) {
      return;
    }
    try {
      const { deleteGroup } = await import('@shared/store/groupsStore');
      await deleteGroup(groupName);
      const { refreshFavorites } = await import('@shared/store/favoritesStore');
      await refreshFavorites();
    } catch (error) {
      console.error('删除分组失败:', error);
      await showError(t('groups.deleteFailed'), t('common.confirm'));
    }
  };

  // 处理拖拽结束
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }

    const sortableGroups = groups.groups.filter(g => g.name !== '全部');
    const oldIndex = sortableGroups.findIndex(g => g.name === active.id);
    const newIndex = sortableGroups.findIndex(g => g.name === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newSortableGroups = arrayMove([...sortableGroups], oldIndex, newIndex);
      const allGroup = groups.groups.find(g => g.name === '全部');
      const newGroups = allGroup ? [allGroup, ...newSortableGroups] : newSortableGroups;
      
      try {
        await reorderGroups(newGroups);

        if (groups.currentGroup === '全部') {
          const { refreshFavorites } = await import('@shared/store/favoritesStore');
          await refreshFavorites();
        }
      } catch (error) {
        console.error('排序失败:', error);
      }
    }
  };

  return (
    <>
      <div
        className="relative flex flex-col h-full w-full"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 弹出面板 */}
        {isOpen && (
          <div className={`groups-panel absolute bottom-full left-0 right-0 max-h-[350px] backdrop-blur-xl bg-[#fdfdfd] dark:bg-gray-800 border border-b-0 border-gray-300/80 dark:border-gray-700/30 rounded-t-xl shadow-2xl z-40 overflow-hidden flex flex-col ${
            uiAnimationEnabled ? (isClosing ? 'animate-slide-down' : 'animate-slide-up') : ''
          }`}>
            {/* 头部 */}
            <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-200/50 dark:border-gray-700/50">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('groups.title')}
              </h3>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleAddGroup}
                  className="p-1 rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-all text-gray-500 dark:text-gray-400"
                  title={t('groups.add')}
                >
                  <i className="ti ti-plus" style={{ fontSize: 12 }}></i>
                </button>
                <button
                  onClick={togglePin}
                  className={`p-1 rounded transition-all ${
                    isPinned
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-gray-200/60 dark:hover:bg-gray-700/60 text-gray-500 dark:text-gray-400'
                  }`}
                  title={isPinned ? t('groups.unpin') : t('groups.pin')}
                >
                  {isPinned ? (
                    <i className="ti ti-pinned" style={{ fontSize: 12 }}></i>
                  ) : (
                    <i className="ti ti-pin" style={{ fontSize: 12 }}></i>
                  )}
                </button>
              </div>
            </div>

            {/* 分组列表 */}
            <div className="flex-1 overflow-y-auto py-1">
              {groups.groups.filter(g => g.name === '全部').map(group => (
                <div
                  key={group.name}
                  onClick={() => handleSelectGroup(group.name)}
                  className="group relative"
                >
                  <div className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-all ${
                    groups.currentGroup === group.name
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}>

                    <div className="flex-shrink-0 opacity-0">
                      <i className="ti ti-grip-vertical" style={{ fontSize: 10 }}></i>
                    </div>
                    <div className="flex-shrink-0">
                      <i className={group.icon} style={{ fontSize: 12 }}></i>
                    </div>
                    <div className="flex-1 text-[11px] font-medium truncate">
                      {group.name}
                    </div>
                  </div>
                </div>
              ))}

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              >
                <SortableContext
                  items={groups.groups.filter(g => g.name !== '全部').map(g => g.name)}
                  strategy={verticalListSortingStrategy}
                >
                  {groups.groups.filter(g => g.name !== '全部').map(group => (
                    <SortableGroupItem
                      key={group.name}
                      group={group}
                      isActive={groups.currentGroup === group.name}
                      onSelect={handleSelectGroup}
                      onEdit={handleEditGroup}
                      onDelete={handleDeleteGroup}
                      t={t}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        )}

        {/* 触发按钮 */}
        <button
          onClick={togglePopup}
          className={`flex items-center justify-center gap-1.5 w-full h-full px-3 transition-all duration-300 ${
            isOpen
              ? 'bg-white/95 dark:bg-gray-800/95 text-gray-900 dark:text-gray-100 shadow-lg border border-t-0 border-gray-200/50 dark:border-gray-700/50'
              : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-300/50 dark:hover:bg-gray-800/50'
          }`}
          title={t('groups.title')}
        >
          <i className="ti ti-folders" style={{ fontSize: 12 }}></i>
          <span className="text-[10px] font-medium truncate max-w-[60px]">{groups.currentGroup}</span>
        </button>
      </div>

      {/* 分组模态框 */}
      {showModal && (
        <GroupModal
          group={editingGroup}
          onClose={() => {
            setShowModal(false);
            setEditingGroup(null);
          }}
          onSave={async () => {
            setShowModal(false);
            setEditingGroup(null);
            const { refreshFavorites } = await import('@shared/store/favoritesStore');
            await refreshFavorites();
          }}
        />
      )}
    </>
  );
});

GroupsPopup.displayName = 'GroupsPopup';
export default GroupsPopup;