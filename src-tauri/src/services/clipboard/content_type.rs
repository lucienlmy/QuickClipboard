// 剪贴板内容类型管理模块
use std::collections::HashSet;

/// 主类型：互斥的内容类型
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrimaryType {
    Image,
    File,
    Text,
}

impl PrimaryType {
    pub fn as_str(&self) -> &str {
        match self {
            PrimaryType::Image => "image",
            PrimaryType::File => "file",
            PrimaryType::Text => "text",
        }
    }
    
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "image" => Some(PrimaryType::Image),
            "file" => Some(PrimaryType::File),
            "text" => Some(PrimaryType::Text),
            _ => None,
        }
    }
}

/// 标签类型：可组合的内容特征
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TagType {
    RichText,
    Link,
}

impl TagType {
    pub fn as_str(&self) -> &str {
        match self {
            TagType::RichText => "rich_text",
            TagType::Link => "link",
        }
    }
    
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "rich_text" => Some(TagType::RichText),
            "link" => Some(TagType::Link),
            _ => None,
        }
    }
}

/// 内容类型（组合了主类型和标签）
#[derive(Debug, Clone)]
pub struct ContentType {
    pub primary: PrimaryType,
    pub tags: HashSet<TagType>,
}

impl ContentType {
    pub fn new(primary: PrimaryType) -> Self {
        Self {
            primary,
            tags: HashSet::new(),
        }
    }
    
    pub fn add_tag(&mut self, tag: TagType) {
        self.tags.insert(tag);
    }
    
    pub fn to_db_string(&self) -> String {
        if self.tags.is_empty() {
            self.primary.as_str().to_string()
        } else {
            let mut tags: Vec<&str> = self.tags.iter().map(|t| t.as_str()).collect();
            tags.sort(); 
            format!("{}|{}", self.primary.as_str(), tags.join(","))
        }
    }

    pub fn from_db_string(s: &str) -> Self {
        if let Some((primary_str, tags_str)) = s.split_once('|') {
            let primary = PrimaryType::from_str(primary_str)
                .unwrap_or(PrimaryType::Text);
            
            let tags: HashSet<TagType> = tags_str
                .split(',')
                .filter_map(TagType::from_str)
                .collect();
            
            Self { primary, tags }
        } else {
            Self::from_legacy_string(s)
        }
    }
    
    /// 从旧版单一类型字符串解析
    fn from_legacy_string(s: &str) -> Self {
        match s {
            "image" => Self::new(PrimaryType::Image),
            "file" => Self::new(PrimaryType::File),
            "rich_text" => {
                let mut ct = Self::new(PrimaryType::Text);
                ct.add_tag(TagType::RichText);
                ct
            },
            "link" => {
                let mut ct = Self::new(PrimaryType::Text);
                ct.add_tag(TagType::Link);
                ct
            },
            "text" | _ => Self::new(PrimaryType::Text),
        }
    }
    
    /// 检查是否匹配筛选条件
    pub fn matches_filter(&self, filter: &str) -> bool {
        if filter == "all" {
            return true;
        }

        if filter == self.primary.as_str() {
            return true;
        }

        for tag in &self.tags {
            if filter == tag.as_str() {
                return true;
            }
        }
        
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_string_conversion() {
        // 纯文本
        let ct = ContentType::new(PrimaryType::Text);
        assert_eq!(ct.to_db_string(), "text");
        
        // 文本+链接
        let ct = ContentType::new(PrimaryType::Text)
            .with_tag(TagType::Link);
        let db_str = ct.to_db_string();
        assert!(db_str.contains("text|"));
        assert!(db_str.contains("link"));
        
        // 文本+富文本+链接
        let ct = ContentType::new(PrimaryType::Text)
            .with_tags(vec![TagType::RichText, TagType::Link]);
        let db_str = ct.to_db_string();
        assert!(db_str.contains("text|"));
    }

    #[test]
    fn test_legacy_compatibility() {
        assert_eq!(
            ContentType::from_db_string("text").primary,
            PrimaryType::Text
        );
        
        let ct = ContentType::from_db_string("rich_text");
        assert_eq!(ct.primary, PrimaryType::Text);
        assert!(ct.has_tag(&TagType::RichText));
        
        let ct = ContentType::from_db_string("link");
        assert_eq!(ct.primary, PrimaryType::Text);
        assert!(ct.has_tag(&TagType::Link));
    }

    #[test]
    fn test_filter_matching() {
        let text = ContentType::new(PrimaryType::Text);
        assert!(text.matches_filter("text"));
        assert!(!text.matches_filter("link"));
        
        let link = ContentType::new(PrimaryType::Text)
            .with_tag(TagType::Link);
        assert!(link.matches_filter("link"));
        assert!(!link.matches_filter("text")); 
        
        let rich = ContentType::new(PrimaryType::Text)
            .with_tag(TagType::RichText);
        assert!(rich.matches_filter("rich_text"));

        let both = ContentType::new(PrimaryType::Text)
            .with_tags(vec![TagType::RichText, TagType::Link]);
        assert!(both.matches_filter("rich_text"));
        assert!(both.matches_filter("link"));
    }
}

