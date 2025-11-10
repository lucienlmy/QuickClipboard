import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useSnapshot } from 'valtio';
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { groupsStore } from '@shared/store/groupsStore';
import { showConfirm, showError } from '@shared/utils/dialog';
import GroupModal from './GroupModal';
const GroupsPopup = forwardRef(({
  activeTab,
  onTabChange,
  onGroupChange
}, ref) => {
  const {
    t
  } = useTranslation();
  const groups = useSnapshot(groupsStore);
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const closeTimerRef = useRef(null);
  const animationTimerRef = useRef(null);

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
    if (isPinned) return; // 固定时不关闭
    setIsClosing(true);
    animationTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 200);
  };

  // 切换弹出状态
  const togglePopup = () => {
    // 清除任何待处理的关闭定时器
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
    // 如果已经开始关闭动画，不允许取消
    if (isClosing) {
      return;
    }

    // 只在面板还未开始关闭时，才取消关闭定时器
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  // 鼠标离开触发区或面板
  const handleMouseLeave = () => {
    if (!isPinned && isOpen && !isClosing) {
      // 延迟 150ms 后关闭，避免鼠标快速移动时抖动
      closeTimerRef.current = setTimeout(() => {
        handleClose();
      }, 150);
    }
  };

  // 选择分组
  const handleSelectGroup = groupName => {
    groupsStore.setCurrentGroup(groupName);

    // 如果不在收藏标签页，切换到收藏标签页
    if (activeTab !== 'favorites') {
      if (onTabChange) {
        onTabChange('favorites');
      }
    }
    if (onGroupChange) {
      onGroupChange(groupName);
    }

    // 选择后关闭面板
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
    const confirmed = await showConfirm(t('groups.confirmDelete', {
      name: groupName
    }), t('common.confirm'));
    if (!confirmed) {
      return;
    }
    try {
      const {
        deleteGroup
      } = await import('@shared/store/groupsStore');
      await deleteGroup(groupName);

      // 重新加载收藏列表
      const {
        refreshFavorites
      } = await import('@shared/store/favoritesStore');
      await refreshFavorites();
    } catch (error) {
      console.error('删除分组失败:', error);
      await showError(t('groups.deleteFailed'), t('common.confirm'));
    }
  };
  return <>
    <div className="relative flex flex-col items-end" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* 弹出面板 */}
      {isOpen && <div className={`groups-panel absolute bottom-full right-0 w-[100px] max-h-[350px] backdrop-blur-xl bg-white/95 dark:bg-gray-800/95 border border-b-0 border-gray-300/80 dark:border-gray-700/30 rounded-t-xl shadow-2xl z-40 overflow-hidden flex flex-col ${isClosing ? 'animate-slide-down' : 'animate-slide-up'}`}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-200/50 dark:border-gray-700/50">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {t('groups.title')}
          </h3>
          <div className="flex items-center gap-0.5">
            <button onClick={handleAddGroup} className="p-1 rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-all text-gray-500 dark:text-gray-400" title={t('groups.add')}>
              <i className="ti ti-plus" style={{
                fontSize: 12
              }}></i>
            </button>
            <button onClick={togglePin} className={`p-1 rounded transition-all ${isPinned ? 'bg-blue-100/60 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-200/60 dark:hover:bg-gray-700/60 text-gray-500 dark:text-gray-400'}`} title={isPinned ? t('groups.unpin') : t('groups.pin')}>
              {isPinned ? <i className="ti ti-pinned" style={{
                fontSize: 12
              }}></i> : <i className="ti ti-pin" style={{
                fontSize: 12
              }}></i>}
            </button>
          </div>
        </div>

        {/* 分组列表 */}
        <div className="flex-1 overflow-y-auto py-1">
          {groups.groups.map(group => {
            const isActive = groups.currentGroup === group.name;
            return <div key={group.name} onClick={() => handleSelectGroup(group.name)} className="group relative">
              {/* 分组项 */}
              <div className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-all ${isActive ? 'bg-blue-500 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
                {/* 图标 */}
                <div className="flex-shrink-0">
                  <i className={group.icon} style={{ fontSize: 14 }}></i>
                </div>

                {/* 名称 */}
                <div className="flex-1 text-xs font-medium truncate">
                  {group.name}
                </div>
              </div>

              {/* 操作按钮（全部分组不显示） - 悬停在右侧显示 */}
              {group.name !== '全部' && <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'opacity-100' : ''}`}>
                <button onClick={e => handleEditGroup(e, group)} className={`p-0.5 rounded transition-all shadow-sm ${isActive ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500'}`} title={t('groups.edit')}>
                  <i className="ti ti-edit" style={{
                    fontSize: 10
                  }}></i>
                </button>
                <button onClick={e => handleDeleteGroup(e, group.name)} className={`p-0.5 rounded transition-all shadow-sm ${isActive ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/50'}`} title={t('groups.delete')}>
                  <i className="ti ti-trash" style={{
                    fontSize: 10
                  }}></i>
                </button>
              </div>}
            </div>;
          })}
        </div>
      </div>}

      {/* 触发按钮 */}
      <button onClick={togglePopup} className={`flex items-center justify-center gap-1.5 w-[100px] h-5 transition-all duration-300 ${isOpen ? 'bg-white/95 dark:bg-gray-800/95 text-gray-900 dark:text-gray-100 shadow-lg rounded-b-lg border border-t-0 border-gray-200/50 dark:border-gray-700/50' : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-300/50 dark:hover:bg-gray-800/50 rounded-lg'}`} title={t('groups.title')}>
        <i className="ti ti-folders" style={{
          fontSize: 12
        }}></i>
        <span className="text-[10px] font-medium truncate max-w-[60px]">{groups.currentGroup}</span>
      </button>
    </div>

    {/* 分组模态框 */}
    {showModal && <GroupModal group={editingGroup} onClose={() => {
      setShowModal(false);
      setEditingGroup(null);
    }} onSave={async () => {
      setShowModal(false);
      setEditingGroup(null);
      // 重新加载收藏列表
      const {
        refreshFavorites
      } = await import('@shared/store/favoritesStore');
      await refreshFavorites();
    }} />}
  </>;
});
GroupsPopup.displayName = 'GroupsPopup';
export default GroupsPopup;