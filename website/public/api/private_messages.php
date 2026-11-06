<?php
declare(strict_types=1);

// Personal messages are available only through the authenticated /api/index.php router.
// Neither the public forum nor administrators get access to another user's conversations.

function pm_ensure_schema(PDO $pdo): void {
    static $ready = false;
    if ($ready) return;
    $marker = schema_ready_file('private-messages-v1');
    if (is_file($marker)) { $ready = true; return; }

    try {
        if (!$pdo->query("SHOW TABLES LIKE 'private_message_threads'")->fetchColumn()) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS private_message_threads (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_low_id BIGINT UNSIGNED NOT NULL,
            user_high_id BIGINT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_private_pair (user_low_id, user_high_id),
            KEY idx_private_low_updated (user_low_id, updated_at),
            KEY idx_private_high_updated (user_high_id, updated_at),
            CONSTRAINT fk_private_low FOREIGN KEY (user_low_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_private_high FOREIGN KEY (user_high_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        }
        if (!$pdo->query("SHOW TABLES LIKE 'private_messages'")->fetchColumn()) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS private_messages (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            thread_id BIGINT UNSIGNED NOT NULL,
            sender_id BIGINT UNSIGNED NOT NULL,
            body TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_private_thread (thread_id, id),
            KEY idx_private_unread (thread_id, sender_id, read_at),
            KEY idx_private_sent (sender_id, created_at),
            CONSTRAINT fk_private_thread FOREIGN KEY (thread_id) REFERENCES private_message_threads(id) ON DELETE CASCADE,
            CONSTRAINT fk_private_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        }
    } catch (Throwable $e) {
        json_response(['ok' => false, 'message' => 'Хранилище личных сообщений пока не настроено.'], 503);
    }
    @file_put_contents($marker, "ready\n", LOCK_EX);
    $ready = true;
}

function pm_public_user(array $row): array {
    $id = (int)$row['id'];
    return [
        'id' => $id,
        'name' => (string)$row['name'],
        'avatarUrl' => avatar_url($row),
    ];
}

function pm_get_thread(PDO $pdo, int $threadId, int $viewerId): ?array {
    $stmt = $pdo->prepare('SELECT id,user_low_id,user_high_id FROM private_message_threads
        WHERE id=? AND (user_low_id=? OR user_high_id=?) LIMIT 1');
    $stmt->execute([$threadId, $viewerId, $viewerId]);
    return $stmt->fetch() ?: null;
}

function pm_total_unread(PDO $pdo, int $viewerId): int {
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM private_messages m
        JOIN private_message_threads t ON t.id=m.thread_id
        WHERE (t.user_low_id=? OR t.user_high_id=?) AND m.sender_id<>? AND m.read_at IS NULL');
    $stmt->execute([$viewerId, $viewerId, $viewerId]);
    return (int)$stmt->fetchColumn();
}

function private_messages_handle(PDO $pdo, string $action, array $config): never {
    $me = require_user($pdo);
    $meId = (int)$me['id'];
    if (in_array($action, ['pm-send', 'pm-read'], true)) {
        require_method('POST');
        require_csrf();
    } else {
        require_method('GET');
    }
    pm_ensure_schema($pdo);

    if ($action === 'pm-users') {
        $query = trim((string)($_GET['q'] ?? ''));
        if (text_length($query) < 2) json_response(['ok' => true, 'users' => []]);
        if (text_length($query) > 80) json_response(['ok' => false, 'message' => 'Слишком длинный запрос.'], 422);
        $stmt = $pdo->prepare("SELECT id,name,avatar_file FROM users
            WHERE id<>? AND name LIKE ? ORDER BY name ASC,id ASC LIMIT 12");
        $stmt->execute([$meId, '%' . $query . '%']);
        json_response(['ok' => true, 'users' => array_map('pm_public_user', $stmt->fetchAll())]);
    }

    if ($action === 'pm-unread') {
        json_response(['ok' => true, 'count' => pm_total_unread($pdo, $meId)]);
    }

    if ($action === 'pm-inbox') {
        $stmt = $pdo->prepare('SELECT t.id,t.updated_at,u.id AS other_id,u.name,u.avatar_file,
            latest.body AS last_body,latest.created_at AS last_at,latest.sender_id AS last_sender_id,
            (SELECT COUNT(*) FROM private_messages unread
             WHERE unread.thread_id=t.id AND unread.sender_id<>? AND unread.read_at IS NULL) AS unread_count
            FROM private_message_threads t
            JOIN users u ON u.id=IF(t.user_low_id=?,t.user_high_id,t.user_low_id)
            LEFT JOIN private_messages latest ON latest.id=(
                SELECT MAX(lastmsg.id) FROM private_messages lastmsg WHERE lastmsg.thread_id=t.id
            )
            WHERE t.user_low_id=? OR t.user_high_id=?
            ORDER BY t.updated_at DESC,t.id DESC LIMIT 60');
        $stmt->execute([$meId, $meId, $meId, $meId]);
        $threads = [];
        foreach ($stmt->fetchAll() as $row) {
            $threads[] = [
                'id' => (int)$row['id'],
                'other' => pm_public_user([
                    'id' => $row['other_id'], 'name' => $row['name'], 'avatar_file' => $row['avatar_file'],
                ]),
                'lastBody' => (string)($row['last_body'] ?? ''),
                'lastAt' => (string)($row['last_at'] ?? ''),
                'lastSenderId' => (int)($row['last_sender_id'] ?? 0),
                'unread' => (int)$row['unread_count'],
            ];
        }
        json_response(['ok' => true, 'meId' => $meId, 'threads' => $threads, 'unread' => pm_total_unread($pdo, $meId)]);
    }

    if ($action === 'pm-thread') {
        $threadId = max(0, (int)($_GET['thread'] ?? 0));
        $otherId = max(0, (int)($_GET['user'] ?? 0));
        $thread = null;

        if ($threadId) {
            $thread = pm_get_thread($pdo, $threadId, $meId);
            if (!$thread) json_response(['ok' => false, 'message' => 'Переписка не найдена.'], 404);
            $otherId = (int)($thread['user_low_id'] == $meId ? $thread['user_high_id'] : $thread['user_low_id']);
        } else {
            if (!$otherId || $otherId === $meId) json_response(['ok' => false, 'message' => 'Выберите другого пользователя.'], 422);
            $low = min($meId, $otherId);
            $high = max($meId, $otherId);
            $stmt = $pdo->prepare('SELECT id,user_low_id,user_high_id FROM private_message_threads WHERE user_low_id=? AND user_high_id=? LIMIT 1');
            $stmt->execute([$low, $high]);
            $thread = $stmt->fetch() ?: null;
        }

        $stmt = $pdo->prepare('SELECT id,name,avatar_file FROM users WHERE id=? LIMIT 1');
        $stmt->execute([$otherId]);
        $other = $stmt->fetch();
        if (!$other) json_response(['ok' => false, 'message' => 'Пользователь не найден.'], 404);

        $messages = [];
        if ($thread) {
            $stmt = $pdo->prepare('SELECT id,sender_id,body,created_at,read_at FROM private_messages
                WHERE thread_id=? ORDER BY id DESC LIMIT 100');
            $stmt->execute([(int)$thread['id']]);
            foreach (array_reverse($stmt->fetchAll()) as $m) {
                $messages[] = [
                    'id' => (int)$m['id'],
                    'senderId' => (int)$m['sender_id'],
                    'body' => (string)$m['body'],
                    'createdAt' => (string)$m['created_at'],
                    'read' => !empty($m['read_at']),
                ];
            }
        }
        json_response([
            'ok' => true, 'threadId' => $thread ? (int)$thread['id'] : null,
            'other' => pm_public_user($other), 'messages' => $messages,
            'meId' => $meId,
        ]);
    }

    if ($action === 'pm-read') {
        $input = input_json();
        $threadId = max(0, (int)($input['threadId'] ?? 0));
        if (!$threadId || !pm_get_thread($pdo, $threadId, $meId)) {
            json_response(['ok' => false, 'message' => 'Переписка не найдена.'], 404);
        }
        $stmt = $pdo->prepare('UPDATE private_messages SET read_at=NOW()
            WHERE thread_id=? AND sender_id<>? AND read_at IS NULL');
        $stmt->execute([$threadId, $meId]);
        json_response(['ok' => true]);
    }

    if ($action === 'pm-send') {
        $input = input_json();
        $body = trim((string)($input['body'] ?? ''));
        $body = preg_replace("/\r\n?|\n/u", "\n", $body) ?? $body;
        if (text_length($body) < 1 || text_length($body) > 3000) {
            json_response(['ok' => false, 'message' => 'Сообщение должно содержать от 1 до 3000 символов.'], 422);
        }
        $threadId = max(0, (int)($input['threadId'] ?? 0));
        $recipientId = max(0, (int)($input['userId'] ?? 0));
        if ($threadId) {
            $thread = pm_get_thread($pdo, $threadId, $meId);
            if (!$thread) json_response(['ok' => false, 'message' => 'Переписка не найдена.'], 404);
            $recipientId = (int)($thread['user_low_id'] == $meId ? $thread['user_high_id'] : $thread['user_low_id']);
        }
        if (!$recipientId || $recipientId === $meId) {
            json_response(['ok' => false, 'message' => 'Выберите получателя.'], 422);
        }
        $recipient = $pdo->prepare('SELECT id,email,email_verified_at,notify_messages FROM users WHERE id=? LIMIT 1');
        $recipient->execute([$recipientId]);
        $recipientData = $recipient->fetch();
        if (!$recipientData) {
            json_response(['ok' => false, 'message' => 'Получатель не найден.'], 404);
        }

        rate_limit($pdo, 'pm-send', 15, 60);
        $recent = $pdo->prepare('SELECT COUNT(*) FROM private_messages WHERE sender_id=?
            AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)');
        $recent->execute([$meId]);
        if ((int)$recent->fetchColumn() >= 200) {
            json_response(['ok' => false, 'message' => 'Достигнут дневной лимит личных сообщений.'], 429);
        }

        try {
            $pdo->beginTransaction();
            $low = min($meId, $recipientId);
            $high = max($meId, $recipientId);
            $stmt = $pdo->prepare('INSERT INTO private_message_threads (user_low_id,user_high_id)
                VALUES (?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)');
            $stmt->execute([$low, $high]);
            $threadId = (int)$pdo->lastInsertId();
            $stmtUnread = $pdo->prepare('SELECT COUNT(*) FROM private_messages
                WHERE thread_id=? AND sender_id<>? AND read_at IS NULL');
            $stmtUnread->execute([$threadId, $meId]);
            $alreadyUnread = (int)$stmtUnread->fetchColumn() > 0;
            $stmt = $pdo->prepare('INSERT INTO private_messages(thread_id,sender_id,body) VALUES(?,?,?)');
            $stmt->execute([$threadId, $meId, $body]);
            $messageId = (int)$pdo->lastInsertId();
            $pdo->prepare('UPDATE private_message_threads SET updated_at=NOW() WHERE id=?')->execute([$threadId]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            json_response(['ok' => false, 'message' => 'Не удалось отправить сообщение.'], 503);
        }
        // Notify once for a newly unread conversation, rather than emailing on
        // every subsequent message. Email contains no private message text.
        if (!$alreadyUnread && !empty($recipientData['notify_messages']) && !empty($recipientData['email_verified_at'])) {
            try {
                $link = app_url($config) . '/messages.html?user=' . $meId;
                $senderName = htmlspecialchars((string)$me['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $notice = '<p>Вам пришло новое личное сообщение от пользователя <b>' . $senderName . '</b> на сайте Fiery Led Lamp.</p>'
                    . '<p>Чтобы прочитать сообщение, войдите в свой аккаунт на сайте.</p>';
                send_email($config, (string)$recipientData['email'],
                    'Новое личное сообщение - Fiery Led Lamp',
                    email_layout('Новое личное сообщение', $notice, 'Открыть переписку', $link));
            } catch (Throwable $e) {
                // Successful message delivery must not depend on email service.
            }
        }
        json_response(['ok' => true, 'threadId' => $threadId, 'messageId' => $messageId]);
    }

    json_response(['ok' => false, 'message' => 'Неизвестная операция.'], 404);
}
