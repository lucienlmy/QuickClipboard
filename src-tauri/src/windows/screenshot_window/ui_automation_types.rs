use std::cmp::Ordering;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Copy, PartialOrd)]
pub struct ElementLevel {
    pub element_index: i32,
    pub element_level: i32,
    pub parent_index: i32,
    pub window_index: i32,
}

impl ElementLevel {
    pub fn root() -> Self {
        Self {
            element_index: 0,
            element_level: 0,
            parent_index: i32::MAX,
            window_index: i32::MAX,
        }
    }

    pub fn next_level(&mut self) {
        self.parent_index = self.element_index;
        self.element_index = 0;
        self.element_level += 1;
    }

    pub fn next_element(&mut self) {
        self.element_index += 1;
    }
}

impl Ord for ElementLevel {
    fn cmp(&self, other: &Self) -> Ordering {
        match (other.window_index.cmp(&self.window_index),
               self.element_level.cmp(&other.element_level),
               other.element_index.cmp(&self.element_index),
               other.parent_index.cmp(&self.parent_index)) {
            (Ordering::Equal, Ordering::Equal, Ordering::Equal, parent_ord) => parent_ord,
            (Ordering::Equal, Ordering::Equal, idx_ord, _) => idx_ord,
            (Ordering::Equal, level_ord, _, _) => level_ord,
            (win_ord, _, _, _) => win_ord,
        }
    }
}
