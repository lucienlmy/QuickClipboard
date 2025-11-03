// 剪贴板内容类型管理模块

/// 内容类型
#[derive(Debug, Clone)]
pub struct ContentType {
    types: Vec<String>,
}

impl ContentType {
    pub fn new(primary_type: &str) -> Self {
        Self {
            types: vec![primary_type.to_string()],
        }
    }
    
    pub fn add_type(&mut self, type_name: &str) {
        if !self.types.contains(&type_name.to_string()) {
            self.types.push(type_name.to_string());
        }
    }

    pub fn to_db_string(&self) -> String {
        self.types.join(",")
    }

    pub fn from_db_string(s: &str) -> Self {
        let types: Vec<String> = s.split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect();
        
        if types.is_empty() {
            Self::new("text")
        } else {
            Self { types }
        }
    }
    

    pub fn primary(&self) -> &str {
        self.types.first().map(|s| s.as_str()).unwrap_or("text")
    }

    pub fn has_type(&self, type_name: &str) -> bool {
        self.types.iter().any(|t| t == type_name)
    }

    pub fn matches_filter(&self, filter: &str) -> bool {
        if filter == "all" {
            return true;
        }
        self.has_type(filter)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let ct = ContentType::new("text");
        assert_eq!(ct.primary(), "text");
        assert_eq!(ct.to_db_string(), "text");
    }

    #[test]
    fn test_add_type() {
        let mut ct = ContentType::new("rich_text");
        ct.add_type("link");
        assert_eq!(ct.to_db_string(), "rich_text,link");
    }

    #[test]
    fn test_from_db_string() {
        let ct = ContentType::from_db_string("rich_text,link");
        assert_eq!(ct.primary(), "rich_text");
        assert!(ct.has_type("rich_text"));
        assert!(ct.has_type("link"));
    }

    #[test]
    fn test_matches_filter() {
        let ct = ContentType::from_db_string("rich_text,link");
        assert!(ct.matches_filter("rich_text"));
        assert!(ct.matches_filter("link"));
        assert!(ct.matches_filter("all"));
        assert!(!ct.matches_filter("image"));
    }
}
