-- OPTIONAL: only for a brand-new empty shared bank. Migrate local questions first.
-- This is a setup script, never run on page load. Repeating it does not duplicate data.
insert into public.questions(id, question, answers, explanation, difficulty, category, tags, order_index)
select 'forma-imbalanced-learning-seed-v1', 'What is the central concern of imbalanced learning?',
'[
 {"id":"seed-a","text":"Replacing supervised learning with completely unlabeled data analysis","isCorrect":false},
 {"id":"seed-b","text":"Learning effectively when classes are severely underrepresented or unevenly distributed","isCorrect":true},
 {"id":"seed-c","text":"Reducing the number of features before applying any classification algorithm","isCorrect":false},
 {"id":"seed-d","text":"Learning only when every class contains exactly the same number of examples","isCorrect":false}
]'::jsonb,
'Imbalanced learning addresses the performance of learning algorithms when data contain underrepresented classes and severe class-distribution skews.',
'medium', 'Machine learning', array['Class imbalance','Fundamentals'], 0
where not exists (select 1 from public.questions)
on conflict (id) do nothing;
