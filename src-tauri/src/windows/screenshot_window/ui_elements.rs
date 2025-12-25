use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::Arc;

use atree::{Arena, Token};
use rstar::{RTree, AABB, RTreeObject, PointDistance};
use uiautomation::core::UICacheRequest;
use uiautomation::types::{TreeScope, UIProperty};
use uiautomation::{UIAutomation, UIElement, UITreeWalker};
use windows::Win32::Foundation::HWND;

use super::element_rect::ElementRect;
use super::ui_automation_types::ElementLevel;

#[derive(Debug, Clone)]
struct IndexedElement {
    bounds: AABB<[f64; 2]>,
    level: ElementLevel,
}

impl RTreeObject for IndexedElement {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.bounds
    }
}

impl PointDistance for IndexedElement {
    fn distance_2(&self, point: &[f64; 2]) -> f64 {
        self.bounds.distance_2(point)
    }
}

pub struct UiElementIndex {
    automation: Option<Arc<UIAutomationWrapper>>,
    walker: Option<UITreeWalker>,
    desktop_root: Option<UIElement>,
    cache_req: Option<UICacheRequest>,
    spatial_index: RTree<IndexedElement>,
    level_to_element: HashMap<ElementLevel, (UIElement, Token)>,
    rect_tree: Arena<uiautomation::types::Rect>,
    child_cache: HashMap<ElementLevel, Option<(UIElement, ElementLevel)>>,
    window_bounds: HashMap<ElementLevel, uiautomation::types::Rect>,
    window_levels: HashMap<i32, ElementLevel>,
}

unsafe impl Send for UiElementIndex {}
unsafe impl Sync for UiElementIndex {}

struct UIAutomationWrapper {
    automation: UIAutomation,
}

unsafe impl Send for UIAutomationWrapper {}
unsafe impl Sync for UIAutomationWrapper {}

impl UiElementIndex {
    pub fn new() -> Self {
        Self {
            automation: None,
            walker: None,
            desktop_root: None,
            cache_req: None,
            rect_tree: Arena::new(),
            spatial_index: RTree::new(),
            level_to_element: HashMap::new(),
            child_cache: HashMap::new(),
            window_bounds: HashMap::new(),
            window_levels: HashMap::new(),
        }
    }

    fn to_aabb(r: uiautomation::types::Rect) -> AABB<[f64; 2]> {
        AABB::from_corners(
            [r.get_left() as f64, r.get_top() as f64],
            [r.get_right() as f64, r.get_bottom() as f64],
        )
    }

    pub fn init(&mut self) -> Result<(), String> {
        if self.automation.is_some() {
            return Ok(());
        }

        let uia = UIAutomation::new().map_err(|e| format!("创建 UIAutomation 失败: {:?}", e))?;
        let content_walker = uia.get_content_view_walker()
            .map_err(|e| format!("获取 TreeWalker 失败: {:?}", e))?;

        let mut cache = uia.create_cache_request()
            .map_err(|e| format!("创建缓存请求失败: {:?}", e))?;
        cache.add_property(UIProperty::BoundingRectangle)
            .map_err(|e| format!("添加属性失败: {:?}", e))?;
        cache.add_property(UIProperty::ControlType)
            .map_err(|e| format!("添加属性失败: {:?}", e))?;
        cache.add_property(UIProperty::IsOffscreen)
            .map_err(|e| format!("添加属性失败: {:?}", e))?;
        cache.set_tree_scope(TreeScope::Element)
            .map_err(|e| format!("设置作用域失败: {:?}", e))?;

        self.automation = Some(Arc::new(UIAutomationWrapper { automation: uia }));
        self.walker = Some(content_walker);
        self.cache_req = Some(cache);

        Ok(())
    }

    fn fix_inverted_rect(rect: uiautomation::types::Rect) -> uiautomation::types::Rect {
        let (l, r) = if rect.get_left() > rect.get_right() {
            (rect.get_right(), rect.get_left())
        } else {
            (rect.get_left(), rect.get_right())
        };
        let (t, b) = if rect.get_top() > rect.get_bottom() {
            (rect.get_bottom(), rect.get_top())
        } else {
            (rect.get_top(), rect.get_bottom())
        };
        uiautomation::types::Rect::new(l, t, r, b)
    }

    fn exceeds_bounds(child: uiautomation::types::Rect, parent: uiautomation::types::Rect) -> bool {
        child.get_left() < parent.get_left()
            || child.get_right() > parent.get_right()
            || child.get_top() < parent.get_top()
            || child.get_bottom() > parent.get_bottom()
    }

    fn constrain_to_parent(child: uiautomation::types::Rect, parent: uiautomation::types::Rect) -> uiautomation::types::Rect {
        uiautomation::types::Rect::new(
            child.get_left().max(parent.get_left()),
            child.get_top().max(parent.get_top()),
            child.get_right().min(parent.get_right()),
            child.get_bottom().min(parent.get_bottom()),
        )
    }

    pub fn rebuild_index(&mut self, exclude_hwnd: Option<isize>) -> Result<(), String> {
        let automation = self
            .automation
            .as_ref()
            .ok_or_else(|| "UIAutomation 未初始化".to_string())?;

        self.desktop_root.replace(
            automation.automation.get_root_element()
                .map_err(|e| format!("获取根元素失败: {:?}", e))?
        );
        let root = self.desktop_root.as_ref().unwrap().clone();

        self.rect_tree = Arena::new();
        self.spatial_index = RTree::new();
        self.level_to_element.clear();
        self.child_cache.clear();
        self.window_bounds.clear();
        self.window_levels.clear();

        let mut level = ElementLevel::root();
        let (vx, vy, vw, vh) = crate::screen::ScreenUtils::get_virtual_screen_size()
            .unwrap_or((0, 0, 1920, 1080));
        let root_bounds = uiautomation::types::Rect::new(vx, vy, vx + vw, vy + vh);

        let mut root_token = self.rect_tree.new_node(root_bounds);
        let (_, mut parent_token) = self.add_to_index(
            &mut root_token,
            root.clone(),
            root_bounds,
            level,
        );
        let tree_walker = self.walker.as_ref().unwrap().clone();
        let mut top_windows = Vec::new();

        let mut current = tree_walker.get_first_child(&root).ok();
        while let Some(win_elem) = current {
            if let Some(hwnd_filter) = exclude_hwnd {
                if let Ok(h) = win_elem.get_native_window_handle() {
                    let win_hwnd: HWND = h.into();
                    if win_hwnd.0 as isize == hwnd_filter {
                        current = tree_walker.get_next_sibling(&win_elem).ok();
                        continue;
                    }
                }
            }

            if let Ok(bounds) = win_elem.get_bounding_rectangle() {
                top_windows.push((win_elem.clone(), bounds));
            }

            current = tree_walker.get_next_sibling(&win_elem).ok();
        }

        level.window_index = 0;
        level.next_level();

        for (win_elem, win_rect) in top_windows {
            level.window_index += 1;
            level.next_element();

            let (adjusted_rect, _) = self.add_to_index(
                &mut parent_token,
                win_elem,
                win_rect,
                level,
            );

            self.window_bounds.insert(level.clone(), adjusted_rect);
            self.window_levels.insert(level.window_index, level.clone());
        }

        Ok(())
    }


    fn add_to_index(
        &mut self,
        parent_token: &mut Token,
        elem: UIElement,
        mut bounds: uiautomation::types::Rect,
        level: ElementLevel,
    ) -> (uiautomation::types::Rect, Token) {
        bounds = Self::fix_inverted_rect(bounds);

        let win_level = self.window_levels.get(&level.window_index).unwrap_or(&level);
        if let Some(win_rect) = self.window_bounds.get(win_level) {
            if Self::exceeds_bounds(bounds, *win_rect) {
                bounds = Self::constrain_to_parent(bounds, *win_rect);
            }
        }

        self.spatial_index.insert(IndexedElement {
            bounds: Self::to_aabb(bounds),
            level,
        });

        let node = self.rect_tree.new_node(bounds);
        parent_token.append_node(&mut self.rect_tree, node).unwrap();
        self.level_to_element.insert(level, (elem, node));

        (bounds, node)
    }

    fn find_cached_at(
        &self,
        x: i32,
        y: i32,
    ) -> Option<(UIElement, ElementLevel, uiautomation::types::Rect, Token)> {
        let point = [x as f64, y as f64];
        let matches = self.spatial_index.locate_all_at_point(&point);

        let mut best_level = ElementLevel::root();
        let mut best_aabb: Option<AABB<[f64; 2]>> = None;
        for hit in matches {
            if best_level.cmp(&hit.level) == Ordering::Less {
                best_level = hit.level;
                best_aabb = Some(hit.bounds);
            }
        }

        let bounds = best_aabb.map(|aabb| {
            let lower = aabb.lower();
            let upper = aabb.upper();
            uiautomation::types::Rect::new(
                lower[0] as i32,
                lower[1] as i32,
                upper[0] as i32,
                upper[1] as i32,
            )
        })?;

        self.level_to_element
            .get(&best_level)
            .map(|(elem, tok)| (elem.clone(), best_level, bounds, *tok))
    }

    pub fn query_window_at_point(
        &self,
        mx: i32,
        my: i32,
    ) -> Result<Vec<ElementRect>, String> {
        let point = [mx as f64, my as f64];
        let matches = self.spatial_index.locate_all_at_point(&point);
        
        for hit in matches {
            let level = &hit.level;
            if level.element_level == 1 {
                if let Some(win_rect) = self.window_bounds.get(level) {
                    let outer_rect = ElementRect::from(*win_rect);
                    
                    // 计算内缩矩形（去除窗口阴影）
                    const SHADOW_MARGIN: i32 = 10;
                    let inner_rect = ElementRect {
                        min_x: outer_rect.min_x + SHADOW_MARGIN,
                        min_y: outer_rect.min_y,
                        max_x: outer_rect.max_x - SHADOW_MARGIN,
                        max_y: outer_rect.max_y - SHADOW_MARGIN,
                    };
                    
                    return Ok(vec![inner_rect, outer_rect]);
                }
            }
        }
        
        Ok(Vec::new())
    }

    pub fn query_chain_at_point(
        &mut self,
        mx: i32,
        my: i32,
    ) -> Result<Vec<ElementRect>, String> {
        let walker = self.walker.clone().unwrap();
        let (mut parent_elem, mut parent_lvl, mut parent_bounds, mut parent_tok) =
            self.find_cached_at(mx, my).unwrap_or_else(|| {
                let fallback_bounds = uiautomation::types::Rect::new(0, 0, i32::MAX, i32::MAX);
                (
                    self.desktop_root.clone().unwrap(),
                    ElementLevel::root(),
                    fallback_bounds,
                    self.rect_tree.new_node(fallback_bounds),
                )
            });

        let mut cur_level = ElementLevel::root();
        let mut queue = Option::<UIElement>::None;
        let mut need_query_child = false;

        match self.child_cache.get(&parent_lvl) {
            Some(Some((child, lvl))) => {
                queue = Some(child.clone());
                cur_level = *lvl;
            }
            Some(None) => {}
            None => need_query_child = true,
        };

        if need_query_child {
            let first_child_result = if let Some(req) = &self.cache_req {
                walker.get_first_child_build_cache(&parent_elem, req)
            } else {
                walker.get_first_child(&parent_elem)
            };

            match first_child_result {
                Ok(child_elem) => {
                    queue = Some(child_elem.clone());
                    cur_level = parent_lvl;
                    cur_level.next_level();
                    self.child_cache.insert(parent_lvl, Some((child_elem, cur_level)));
                }
                Err(_) => {
                    self.child_cache.insert(parent_lvl, None);
                }
            }
        }

        let mut cur_bounds = parent_bounds;
        let mut cur_tok = parent_tok;
        let mut result_tok = cur_tok;
        let mut result_bounds = cur_bounds;

        while let Some(elem) = queue.take() {
            queue = None;

            let offscreen = if self.cache_req.is_some() {
                elem.is_cached_offscreen().unwrap_or(true)
            } else {
                elem.is_offscreen().unwrap_or(true)
            };

            if !offscreen {
                cur_bounds = if self.cache_req.is_some() {
                    match elem.get_cached_bounding_rectangle() {
                        Ok(r) => r,
                        Err(_) => continue,
                    }
                } else {
                    match elem.get_bounding_rectangle() {
                        Ok(r) => r,
                        Err(_) => continue,
                    }
                };

                let (l, t, r, b) = (
                    cur_bounds.get_left(),
                    cur_bounds.get_top(),
                    cur_bounds.get_right(),
                    cur_bounds.get_bottom(),
                );

                if !(l == 0 && r == 0 && t == 0 && b == 0) {
                    (cur_bounds, cur_tok) = self.add_to_index(
                        &mut parent_tok,
                        elem.clone(),
                        cur_bounds,
                        cur_level,
                    );

                    if l <= mx && r >= mx && t <= my && b >= my {
                        result_tok = cur_tok;
                        result_bounds = cur_bounds;

                        let child_res = if let Some(req) = &self.cache_req {
                            walker.get_first_child_build_cache(&elem, req)
                        } else {
                            walker.get_first_child(&elem)
                        };

                        if let Ok(child) = child_res {
                            queue = Some(child.clone());
                            parent_tok = cur_tok;
                            parent_lvl = cur_level;
                            cur_level.next_level();

                            self.child_cache.insert(parent_lvl, Some((child, cur_level)));
                            continue;
                        } else {
                            self.child_cache.insert(cur_level, None);
                        }
                    }
                }
            }

            let sibling_res = if let Some(req) = &self.cache_req {
                walker.get_next_sibling_build_cache(&elem, req)
            } else {
                walker.get_next_sibling(&elem)
            };

            match sibling_res {
                Ok(sib) => {
                    queue = Some(sib.clone());
                    cur_level.next_element();
                    self.child_cache.insert(parent_lvl, Some((sib, cur_level)));
                }
                Err(_) => {
                    self.child_cache.insert(parent_lvl, None);
                }
            }
        }

        let chain = result_tok.ancestors(&self.rect_tree);
        let mut rects = Vec::with_capacity(16);
        let mut prev = ElementRect::from(result_bounds);
        rects.push(prev);

        for node in chain {
            let r = ElementRect::from(node.data);
            if r == prev || r.min_x >= prev.max_x || r.min_y >= prev.max_y {
                continue;
            }
            rects.push(r);
            prev = r;
        }

        Ok(rects)
    }
}

impl Drop for UiElementIndex {
    fn drop(&mut self) {
        self.automation = None;
        self.walker = None;
        self.desktop_root = None;
    }
}
