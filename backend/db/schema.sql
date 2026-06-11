DROP TABLE IF EXISTS `users`;

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




DROP TABLE IF EXISTS `questions`;
CREATE TABLE `questions` (
    `question_id` INT AUTO_INCREMENT PRIMARY KEY,
    `question_hash` CHAR(16) NOT NULL UNIQUE, -- Used for /question/:hash routing
    `user_id` INT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL, -- Detailed content including code sections
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (CHAR_LENGTH(`title`) >= 5),
    CHECK (CHAR_LENGTH(`content`) >= 10),

    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,

    INDEX `idx_questions_user_id` (`user_id`),
    INDEX `idx_questions_created_at` (`created_at`),

    -- Full-text search index for exact match search mode
    FULLTEXT KEY `ft_questions_search` (`title`, `content`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


DROP TABLE IF EXISTS `question_vectors`;
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


DROP TABLE IF EXISTS `answers`;
CREATE TABLE `answers` (
     `answer_id` INT AUTO_INCREMENT PRIMARY KEY,
     `question_id` INT NOT NULL,
     `user_id` INT NOT NULL,
     `content` TEXT NOT NULL, -- Content including code sections
     `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 
     FOREIGN KEY (`question_id`) REFERENCES `questions` (`question_id`) ON DELETE CASCADE,
     FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
 
     INDEX `idx_answers_question_id` (`question_id`),
     INDEX `idx_answers_user_id` (`user_id`),
     INDEX `idx_answers_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;