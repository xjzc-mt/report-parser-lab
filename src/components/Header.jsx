import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import {
  IconBooks,
  IconChecklist,
  IconChevronDown,
  IconCoins,
  IconFileText,
  IconFileTypePdf,
  IconFileZip,
  IconFlask,
  IconLayoutDashboard,
  IconScissors,
  IconSparkles
} from '@tabler/icons-react';
import {
  APP_MAIN_TABS,
  APP_SECONDARY_TABS,
  DATA_PREP_TOOLS,
  LAB_BRAND
} from '../constants/labNavigation.js';

export function Header({
  activeTab,
  activeDataPrepSubtab = 'chunking',
  onTabChange,
  onSelectDataPrepTool,
  onOpenPromptAssetLibrary,
  visibleTabs,
  visibleDataPrepTools = DATA_PREP_TOOLS
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownTimerRef = useRef(null);
  const containerRef = useRef(null);
  const triggerButtonRef = useRef(null);
  const toolButtonRefs = useRef([]);

  const isTabVisible = (key) => {
    if (!visibleTabs) return true;
    return visibleTabs.some((tab) => tab.key === key);
  };

  const clearCloseTimer = () => {
    if (dropdownTimerRef.current) {
      clearTimeout(dropdownTimerRef.current);
      dropdownTimerRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimer();
    setDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimer();
    dropdownTimerRef.current = setTimeout(() => {
      setDropdownOpen(false);
    }, 180);
  };

  const handleTriggerClick = () => {
    setDropdownOpen((prev) => !prev);
  };

  const handleTabClick = (tabKey) => {
    clearCloseTimer();
    setDropdownOpen(false);
    onTabChange(tabKey);
  };

  const handleSelectTool = (toolKey) => {
    setDropdownOpen(false);
    if (onSelectDataPrepTool) {
      onSelectDataPrepTool(toolKey);
    } else if (onTabChange) {
      onTabChange('data-prep');
    }
  };

  // 点击外部与按键监听（Esc 关闭）
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && dropdownOpen) {
        setDropdownOpen(false);
        triggerButtonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      clearCloseTimer();
    };
  }, [dropdownOpen]);

  const renderTabIcon = (tabKey) => {
    switch (tabKey) {
      case 'prompt-iteration':
        return <IconFlask size={18} stroke={1.8} />;
      case 'model-validation':
        return <IconChecklist size={18} stroke={1.8} />;
      case 'prompt-optimization':
        return <IconSparkles size={18} stroke={1.8} />;
      case 'online-validation':
        return <IconLayoutDashboard size={18} stroke={1.8} />;
      case 'data-prep':
        return <IconFileTypePdf size={18} stroke={1.8} />;
      case 'docs':
      default:
        return <IconBooks size={18} stroke={1.8} />;
    }
  };

  const renderToolIcon = (toolKey) => {
    switch (toolKey) {
      case 'chunking':
        return <IconScissors size={20} stroke={1.8} />;
      case 'pdf-compress':
        return <IconFileZip size={20} stroke={1.8} />;
      case 'token-estimation':
      default:
        return <IconCoins size={20} stroke={1.8} />;
    }
  };

  const isDataPrepActive = activeTab === 'data-prep';
  const showDataPrep = isTabVisible('data-prep') && visibleDataPrepTools.length > 0;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="brand-block">
            <div className="brand-copy">
              <h1>{LAB_BRAND.title}</h1>
              <p>{LAB_BRAND.subtitle}</p>
            </div>
          </div>

          <nav className="tab-nav" aria-label="主要功能">
            {/* 主要入口 1-4：Prompt快速迭代、模型结果验收、Prompt自动优化、线上验证 */}
            {APP_MAIN_TABS.filter((tab) => !tab.hasDropdown).map((tab) => {
              if (!isTabVisible(tab.key)) return null;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`tab-button ${isActive ? 'active' : ''}`}
                  onClick={() => handleTabClick(tab.key)}
                >
                  {renderTabIcon(tab.key)}
                  <span>{tab.label}</span>
                </button>
              );
            })}

            {/* 主要入口 5：数据预处理（带下拉菜单） */}
            {showDataPrep && (
              <div
                className="data-prep-dropdown-wrapper"
                ref={containerRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  ref={triggerButtonRef}
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={dropdownOpen}
                  className={`tab-button data-prep-trigger ${isDataPrepActive ? 'active' : ''} ${dropdownOpen ? 'dropdown-open' : ''}`}
                  onClick={handleTriggerClick}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDropdownOpen(true);
                      setTimeout(() => {
                        toolButtonRefs.current[0]?.focus();
                      }, 50);
                    }
                  }}
                >
                  {renderTabIcon('data-prep')}
                  <span>数据预处理</span>
                  <IconChevronDown
                    size={14}
                    stroke={2}
                    className={`dropdown-chevron ${dropdownOpen ? 'rotated' : ''}`}
                  />
                </button>

                {dropdownOpen && (
                  <div
                    className="data-prep-panel"
                    role="menu"
                    aria-label="数据预处理工具"
                    onMouseEnter={clearCloseTimer}
                    onMouseLeave={handleMouseLeave}
                  >
                    {visibleDataPrepTools.map((tool, index) => {
                      const isCurrentTool = isDataPrepActive && activeDataPrepSubtab === tool.key;
                      return (
                        <button
                          key={tool.key}
                          ref={(el) => { toolButtonRefs.current[index] = el; }}
                          type="button"
                          role="menuitem"
                          className={`data-prep-tool-card ${isCurrentTool ? 'selected' : ''}`}
                          onClick={() => handleSelectTool(tool.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const next = (index + 1) % visibleDataPrepTools.length;
                              toolButtonRefs.current[next]?.focus();
                            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                              e.preventDefault();
                              const prev = (index - 1 + visibleDataPrepTools.length) % visibleDataPrepTools.length;
                              toolButtonRefs.current[prev]?.focus();
                            }
                          }}
                        >
                          <div className="tool-card-header">
                            <span className="tool-card-icon">
                              {renderToolIcon(tool.key)}
                            </span>
                            <span className="tool-card-title">{tool.label}</span>
                          </div>
                          <p className="tool-card-desc">{tool.description}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 右侧保留说明文档 */}
            {APP_SECONDARY_TABS.map((tab) => {
              if (!isTabVisible(tab.key)) return null;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`tab-button ${isActive ? 'active' : ''}`}
                  onClick={() => handleTabClick(tab.key)}
                >
                  {renderTabIcon(tab.key)}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="topbar-right">
          <Tooltip label="Prompt 资产库">
            <ActionIcon
              variant="default"
              size="lg"
              radius="xl"
              onClick={onOpenPromptAssetLibrary}
              aria-label="打开 Prompt 资产库"
            >
              <IconFileText size={18} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
