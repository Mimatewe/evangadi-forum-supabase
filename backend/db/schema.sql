SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `answer_votes`;
DROP TABLE IF EXISTS `question_tags`;
DROP TABLE IF EXISTS `tags`;
DROP TABLE IF EXISTS `document_chunk_vectors`;
DROP TABLE IF EXISTS `document_chunks`;
DROP TABLE IF EXISTS `documents`;
DROP TABLE IF EXISTS `question_vectors`;
DROP TABLE IF EXISTS `answers`;
DROP TABLE IF EXISTS `questions`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `users` (
    `user_id` INT AUTO_INCREMENT PRIMARY KEY,
    `first_name` VARCHAR(50) NOT NULL,
    `last_name` VARCHAR(50) NOT NULL,
    `email` VARCHAR(320) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (`email` = LOWER(`email`)),
    
    INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `questions` (
    `question_id` INT AUTO_INCREMENT PRIMARY KEY,
    `question_hash` CHAR(16) NOT NULL UNIQUE,
    `user_id` INT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL, 
    `accepted_answer_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (CHAR_LENGTH(`title`) >= 5),
    CHECK (CHAR_LENGTH(`content`) >= 10),

    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,

    INDEX `idx_questions_user_id` (`user_id`),
    INDEX `idx_questions_created_at` (`created_at`),

    FULLTEXT KEY `ft_questions_search` (`title`, `content`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tags` (
    `tag_id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(40) NOT NULL UNIQUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CHECK (`name` = LOWER(`name`)),
    CHECK (`name` REGEXP '^[a-z0-9][a-z0-9-]{1,39}$'),

    INDEX `idx_tags_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `question_tags` (
    `question_id` INT NOT NULL,
    `tag_id` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`question_id`, `tag_id`),
    FOREIGN KEY (`question_id`) REFERENCES `questions` (`question_id`) ON DELETE CASCADE,
    FOREIGN KEY (`tag_id`) REFERENCES `tags` (`tag_id`) ON DELETE CASCADE,

    INDEX `idx_question_tags_tag_id` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `question_vectors` (
     `vector_id` INT AUTO_INCREMENT PRIMARY KEY,
     `question_id` INT NOT NULL,
     `source_text` TEXT NOT NULL,
     `embedding` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`embedding`)),
     `status` ENUM('processing','ready','failed') DEFAULT 'processing',
     `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

     FOREIGN KEY (`question_id`) REFERENCES `questions` (`question_id`) ON DELETE CASCADE,

     INDEX `idx_question_vectors_question_id` (`question_id`),
     INDEX `idx_question_vectors_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `answers` (
     `answer_id` INT AUTO_INCREMENT PRIMARY KEY,
     `question_id` INT NOT NULL,
     `user_id` INT NOT NULL,
     `content` TEXT NOT NULL, 
     `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 
     FOREIGN KEY (`question_id`) REFERENCES `questions` (`question_id`) ON DELETE CASCADE,
     FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
 
     INDEX `idx_answers_question_id` (`question_id`),
     INDEX `idx_answers_user_id` (`user_id`),
     INDEX `idx_answers_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `answer_votes` (
     `answer_id` INT NOT NULL,
     `user_id` INT NOT NULL,
     `value` TINYINT NOT NULL,
     `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

     PRIMARY KEY (`answer_id`, `user_id`),
     FOREIGN KEY (`answer_id`) REFERENCES `answers` (`answer_id`) ON DELETE CASCADE,
     FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
     CHECK (`value` IN (-1, 1)),

     INDEX `idx_answer_votes_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `questions`
    ADD CONSTRAINT `fk_questions_accepted_answer`
    FOREIGN KEY (`accepted_answer_id`) REFERENCES `answers` (`answer_id`) ON DELETE SET NULL;
-- ============================================================
-- RAG Tables
-- ============================================================

CREATE TABLE `documents` (
    `document_id`   INT AUTO_INCREMENT PRIMARY KEY,
    `user_id`       INT NOT NULL,
    `title`         VARCHAR(255) NOT NULL,
    `mime_type`     VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    `byte_size`     INT NOT NULL DEFAULT 0,
    `storage_path`  VARCHAR(500) NOT NULL,
    `status`        ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
    `error_message` TEXT DEFAULT NULL,
    `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,

    INDEX `idx_documents_user_id` (`user_id`),
    INDEX `idx_documents_status`  (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `document_chunks` (
    `chunk_id`      INT AUTO_INCREMENT PRIMARY KEY,
    `document_id`   INT NOT NULL,
    `chunk_index`   INT NOT NULL,
    `content`       TEXT NOT NULL,
    `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (`document_id`) REFERENCES `documents` (`document_id`) ON DELETE CASCADE,

    INDEX `idx_chunks_document_id` (`document_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `document_chunk_vectors` (
    `vector_id`     INT AUTO_INCREMENT PRIMARY KEY,
    `chunk_id`      INT NOT NULL,
    `document_id`   INT NOT NULL,
    `embedding`     LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL
                    CHECK (json_valid(`embedding`)),
    `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (`chunk_id`)    REFERENCES `document_chunks` (`chunk_id`)  ON DELETE CASCADE,
    FOREIGN KEY (`document_id`) REFERENCES `documents`       (`document_id`) ON DELETE CASCADE,

    INDEX `idx_chunk_vectors_document_id` (`document_id`),
    INDEX `idx_chunk_vectors_chunk_id`    (`chunk_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;