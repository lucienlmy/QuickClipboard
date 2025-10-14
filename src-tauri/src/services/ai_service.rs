/// AI服务 - 处理AI相关的业务逻辑
pub struct AIService;

impl AIService {
    /// 获取可用的AI模型列表
    pub async fn get_available_ai_models() -> Result<Vec<String>, String> {
        let settings = crate::settings::get_global_settings();
        let ai_config = crate::ai_config::create_ai_config_from_settings(&settings);

        if !ai_config.is_valid() {
            return Err("AI配置无效，请检查API密钥等设置".to_string());
        }

        let config_manager = crate::ai_config::AIConfigManager::new(ai_config)
            .map_err(|e| format!("创建AI配置管理器失败: {}", e))?;

        config_manager
            .get_available_models()
            .await
            .map_err(|e| format!("获取模型列表失败: {}", e))
    }
}
