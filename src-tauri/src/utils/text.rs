// 文本截断工具函数

pub fn truncate_string(s: String, max_len: usize) -> String {
    if s.is_empty() || s.len() <= max_len {
        return s;
    }
    
    let mut truncate_point = max_len.saturating_sub(50);
    while truncate_point > 0 && !s.is_char_boundary(truncate_point) {
        truncate_point -= 1;
    }
    
    if truncate_point == 0 {
        return "...(内容过长已截断)".to_string();
    }
    
    match s.get(..truncate_point) {
        Some(slice) => format!("{}...(内容过长已截断)", slice),
        None => "...(内容过长已截断)".to_string(),
    }
}

// 截取以关键词为中心的上下文
pub fn truncate_around_keyword(s: String, keyword: &str, max_len: usize) -> String {
    if s.is_empty() || keyword.is_empty() || s.len() <= max_len {
        return if s.len() <= max_len { s } else { truncate_string(s, max_len) };
    }
    
    let s_lower = s.to_lowercase();
    let keyword_lower = keyword.to_lowercase();
    
    let keyword_pos = match s_lower.find(&keyword_lower) {
        Some(pos) => pos,
        None => return truncate_string(s, max_len),
    };

    let context_before = max_len / 3;
    let context_after = max_len.saturating_sub(context_before);

    let mut start = keyword_pos.saturating_sub(context_before);
    while start > 0 && !s.is_char_boundary(start) {
        start -= 1;
    }

    let keyword_byte_len = keyword_lower.len().min(s.len().saturating_sub(keyword_pos));
    let keyword_end = keyword_pos.saturating_add(keyword_byte_len);
    let mut end = keyword_end.saturating_add(context_after).min(s.len());
    while end > start && !s.is_char_boundary(end) {
        end -= 1;
    }
    
    if end <= start {
        return truncate_string(s, max_len);
    }

    let slice = match s.get(start..end) {
        Some(slice) => slice,
        None => return truncate_string(s, max_len),
    };
    
    let mut result = String::with_capacity(slice.len() + 10);
    
    if start > 0 {
        result.push_str("...");
    }
    
    result.push_str(slice);
    
    if end < s.len() {
        result.push_str("...");
    }
    
    result
}
