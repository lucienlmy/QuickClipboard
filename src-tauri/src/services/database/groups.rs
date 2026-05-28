use super::models::GroupInfo;
use super::connection::with_connection;
use crate::services::webdav_sync::types::CloudGroup;
use rusqlite::{params, OptionalExtension};
use chrono;

// 获取所有分组
pub fn webdav_list_groups(device_id: &str) -> Result<Vec<CloudGroup>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT g.name, g.icon, g.color, g.order_index, COALESCE(g.source_device_id, ''),
                    g.created_at, g.updated_at
             FROM groups g
             ORDER BY g.order_index, g.name",
        )?;
        let rows = stmt.query_map([], |row| {
            let source_device_id = row.get::<_, String>(4)?.trim().to_string();
            Ok(CloudGroup {
                name: row.get(0)?,
                icon: row.get(1)?,
                color: row.get(2)?,
                order: row.get(3)?,
                source_device_id: if source_device_id.is_empty() { device_id.to_string() } else { source_device_id },
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        Ok(rows.filter_map(|row| row.ok()).collect())
    })
}

pub fn webdav_save_groups(groups: &[CloudGroup]) -> Result<Vec<CloudGroup>, String> {
    if groups.is_empty() {
        return Ok(Vec::new());
    }

    with_connection(|conn| {
        let tx = conn.unchecked_transaction()?;
        let mut changed = Vec::new();

        for group in groups {
            let existing = tx
                .query_row(
                    "SELECT icon, color, order_index, COALESCE(source_device_id, ''), created_at, updated_at
                     FROM groups WHERE name = ?1 LIMIT 1",
                    params![group.name],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, i32>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, i64>(4)?,
                            row.get::<_, i64>(5)?,
                        ))
                    },
                )
                .optional()?;

            if let Some((icon, color, order, source_device_id, created_at, updated_at)) = existing {
                let same = icon == group.icon
                    && color == group.color
                    && order == group.order
                    && source_device_id == group.source_device_id
                    && created_at == group.created_at
                    && updated_at == group.updated_at;

                if updated_at >= group.updated_at || same {
                    continue;
                }

                tx.execute(
                    "UPDATE groups SET
                        icon = ?1,
                        color = ?2,
                        order_index = ?3,
                        source_device_id = ?4,
                        created_at = ?5,
                        updated_at = ?6
                     WHERE name = ?7",
                    params![
                        group.icon,
                        group.color,
                        group.order,
                        group.source_device_id,
                        group.created_at,
                        group.updated_at,
                        group.name,
                    ],
                )?;
                changed.push(group.clone());
                continue;
            }

            tx.execute(
                "INSERT INTO groups (name, icon, color, order_index, source_device_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    group.name,
                    group.icon,
                    group.color,
                    group.order,
                    group.source_device_id,
                    group.created_at,
                    group.updated_at,
                ],
            )?;
            changed.push(group.clone());
        }

        tx.commit()?;
        Ok(changed)
    })
}

// 获取所有分组
pub fn get_all_groups() -> Result<Vec<GroupInfo>, String> {
    with_connection(|conn| {
        let mut groups = Vec::new();
        
        let mut stmt = conn.prepare("SELECT name, icon, color, order_index FROM groups ORDER BY order_index, name")?;
        let group_rows: Vec<(String, String, String, i32)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        
        drop(stmt);
        
        for (name, icon, color, order) in group_rows {
            let count: i32 = conn.query_row(
                "SELECT COUNT(*) FROM favorites WHERE group_name = ?1",
                params![&name],
                |row| row.get(0)
            )?;
            
            groups.push(GroupInfo {
                name,
                icon,
                color,
                order,
                item_count: count,
            });
        }
        
        Ok(groups)
    })
}

// 添加分组
pub fn add_group(name: String, icon: String, color: String) -> Result<GroupInfo, String> {
    with_connection(|conn| {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM groups WHERE name = ?1",
            params![&name],
            |row| row.get(0)
        )?;
        
        if exists > 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                format!("分组 '{}' 已存在", name)
            ));
        }
        
        let max_order: Option<i32> = conn.query_row(
            "SELECT MAX(order_index) FROM groups",
            [],
            |row| row.get(0)
        ).ok().flatten();
        
        let new_order = max_order.unwrap_or(0) + 1;
        let now = chrono::Local::now().timestamp();
        
        conn.execute(
            "INSERT INTO groups (name, icon, color, order_index, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![&name, &icon, &color, new_order, now, now],
        )?;
        
        Ok(GroupInfo {
            name,
            icon,
            color,
            order: new_order,
            item_count: 0,
        })
    })
}

// 更新分组
pub fn update_group(old_name: String, new_name: String, new_icon: String, new_color: String) -> Result<GroupInfo, String> {
    with_connection(|conn| {
        if old_name != new_name {
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM groups WHERE name = ?1",
                params![&new_name],
                |row| row.get(0)
            )?;
            
            if exists > 0 {
                return Err(rusqlite::Error::InvalidParameterName(
                    format!("分组 '{}' 已存在", new_name)
                ));
            }
        }
        
        let now = chrono::Local::now().timestamp();
        let tx = conn.unchecked_transaction()?;
        
        tx.execute(
            "UPDATE groups SET name = ?1, icon = ?2, color = ?3, updated_at = ?4 WHERE name = ?5",
            params![&new_name, &new_icon, &new_color, now, &old_name],
        )?;
        
        if old_name != new_name {
            tx.execute(
                "UPDATE favorites SET group_name = ?1 WHERE group_name = ?2",
                params![&new_name, &old_name],
            )?;
        }
        
        tx.commit()?;
        
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE group_name = ?1",
            params![&new_name],
            |row| row.get(0)
        )?;
        
        let (order, color): (i32, String) = conn.query_row(
            "SELECT order_index, color FROM groups WHERE name = ?1",
            params![&new_name],
            |row| Ok((row.get(0)?, row.get(1)?))
        )?;
        
        Ok(GroupInfo {
            name: new_name,
            icon: new_icon,
            color,
            order,
            item_count: count,
        })
    })
}

// 删除分组
pub fn delete_group(name: String) -> Result<(), String> {
    with_connection(|conn| {
        if name == "全部" {
            return Err(rusqlite::Error::InvalidParameterName(
                "不能删除'全部'分组".to_string()
            ));
        }
        
        let tx = conn.unchecked_transaction()?;
        
        tx.execute(
            "UPDATE favorites SET group_name = '全部' WHERE group_name = ?1",
            params![&name],
        )?;
        
        tx.execute(
            "DELETE FROM groups WHERE name = ?1",
            params![&name],
        )?;
        
        tx.commit()?;
        Ok(())
    })
}

// 更新分组排序
pub fn reorder_groups(group_orders: Vec<(String, i32)>) -> Result<(), String> {
    with_connection(|conn| {
        let tx = conn.unchecked_transaction()?;
        let now = chrono::Local::now().timestamp();
        
        for (name, order) in group_orders {
            tx.execute(
                "UPDATE groups SET order_index = ?1, updated_at = ?2 WHERE name = ?3",
                params![order, now, &name],
            )?;
        }
        
        tx.commit()?;
        Ok(())
    })
}

