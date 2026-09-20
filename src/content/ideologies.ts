import type { Figure } from '../scene/familyTree'

/**
 * The Ideology Isles: schools of thought as family trees.
 *
 * Five trees — political, economic, two of philosophy, and the religions —
 * each a lineage of ideas in which a figure names what it grew out of.
 * Descent between ideas is never as clean as descent between gods, and every
 * line here is a judgement a historian of ideas could argue with: Stoicism
 * from Cynicism because Zeno studied under Crates; Islam and Sikhism as
 * roots rather than as children, because each says it is; German idealism
 * from both rationalism and empiricism, because Kant said so. The article
 * on each carries the argument.
 */
export type Ideology = {
  id: string
  name: string
  article: string
  color: string
  figures: readonly Figure[]
}

export const IDEOLOGIES: readonly Ideology[] = [
  {
    id: 'political',
    name: 'Political',
    article: 'Political ideology',
    color: '#f2cf6b',
    figures: [
      { name: 'The Enlightenment', article: 'Age of Enlightenment' },
      { name: 'Liberalism', article: 'Liberalism', parents: ['The Enlightenment'] },
      { name: 'Classical liberalism', article: 'Classical liberalism', parents: ['Liberalism'] },
      { name: 'Social liberalism', article: 'Social liberalism', parents: ['Liberalism'] },
      { name: 'Libertarianism', article: 'Libertarianism', parents: ['Classical liberalism'] },
      { name: 'Anarcho-capitalism', article: 'Anarcho-capitalism', parents: ['Libertarianism'] },
      { name: 'Conservatism', article: 'Conservatism' },
      { name: 'Traditionalist conservatism', article: 'Traditionalist conservatism', parents: ['Conservatism'] },
      { name: 'Christian democracy', article: 'Christian democracy', parents: ['Conservatism'] },
      { name: 'Neoconservatism', article: 'Neoconservatism', parents: ['Conservatism'] },
      { name: 'Socialism', article: 'Socialism', parents: ['The Enlightenment'] },
      { name: 'Utopian socialism', article: 'Utopian socialism', parents: ['Socialism'] },
      { name: 'Marxism', article: 'Marxism', parents: ['Socialism'] },
      { name: 'Communism', article: 'Communism', parents: ['Marxism'] },
      { name: 'Marxism–Leninism', article: 'Marxism–Leninism', parents: ['Communism'] },
      { name: 'Maoism', article: 'Maoism', parents: ['Marxism–Leninism'] },
      { name: 'Trotskyism', article: 'Trotskyism', parents: ['Communism'] },
      { name: 'Democratic socialism', article: 'Democratic socialism', parents: ['Socialism'] },
      { name: 'Social democracy', article: 'Social democracy', parents: ['Socialism'] },
      { name: 'Anarchism', article: 'Anarchism', parents: ['The Enlightenment'] },
      { name: 'Anarcho-syndicalism', article: 'Anarcho-syndicalism', parents: ['Anarchism'] },
      { name: 'Anarcho-communism', article: 'Anarcho-communism', parents: ['Anarchism'] },
      { name: 'Nationalism', article: 'Nationalism' },
      { name: 'Fascism', article: 'Fascism', parents: ['Nationalism'] },
      { name: 'Nazism', article: 'Nazism', parents: ['Fascism'] },
      { name: 'Populism', article: 'Populism' },
      { name: 'Feminism', article: 'Feminism', parents: ['The Enlightenment'] },
      { name: 'Environmentalism', article: 'Environmentalism' },
      { name: 'Green politics', article: 'Green politics', parents: ['Environmentalism'] },
    ],
  },
  {
    id: 'economic',
    name: 'Economic',
    article: 'Economic ideology',
    color: '#e8a06a',
    figures: [
      { name: 'Mercantilism', article: 'Mercantilism' },
      { name: 'Physiocracy', article: 'Physiocracy' },
      { name: 'Laissez-faire', article: 'Laissez-faire', parents: ['Physiocracy'] },
      { name: 'Classical economics', article: 'Classical economics', parents: ['Physiocracy'] },
      { name: 'Capitalism', article: 'Capitalism', parents: ['Classical economics'] },
      { name: 'Marxian economics', article: 'Marxian economics', parents: ['Classical economics'] },
      { name: 'Georgism', article: 'Georgism', parents: ['Classical economics'] },
      { name: 'Neoclassical economics', article: 'Neoclassical economics', parents: ['Classical economics'] },
      { name: 'Austrian school', article: 'Austrian school of economics', parents: ['Neoclassical economics'] },
      { name: 'Keynesian economics', article: 'Keynesian economics', parents: ['Neoclassical economics'] },
      { name: 'Post-Keynesian economics', article: 'Post-Keynesian economics', parents: ['Keynesian economics'] },
      { name: 'Monetarism', article: 'Monetarism', parents: ['Neoclassical economics'] },
      { name: 'Neoliberalism', article: 'Neoliberalism', parents: ['Austrian school', 'Monetarism'] },
      { name: 'Ordoliberalism', article: 'Ordoliberalism', parents: ['Neoliberalism'] },
      { name: 'Supply-side economics', article: 'Supply-side economics', parents: ['Monetarism'] },
      { name: 'Behavioural economics', article: 'Behavioral economics', parents: ['Neoclassical economics'] },
      { name: 'Distributism', article: 'Distributism' },
      { name: 'Mutualism', article: 'Mutualism (economic theory)' },
    ],
  },
  {
    id: 'western',
    name: 'Western philosophy',
    article: 'Western philosophy',
    color: '#d8e4f7',
    figures: [
      { name: 'Platonism', article: 'Platonism' },
      { name: 'Aristotelianism', article: 'Aristotelianism', parents: ['Platonism'] },
      { name: 'Neoplatonism', article: 'Neoplatonism', parents: ['Platonism'] },
      { name: 'Scholasticism', article: 'Scholasticism', parents: ['Aristotelianism'] },
      { name: 'Cynicism', article: 'Cynicism (philosophy)' },
      { name: 'Stoicism', article: 'Stoicism', parents: ['Cynicism'] },
      { name: 'Epicureanism', article: 'Epicureanism' },
      { name: 'Skepticism', article: 'Philosophical skepticism' },
      { name: 'Humanism', article: 'Humanism' },
      { name: 'Rationalism', article: 'Rationalism' },
      { name: 'Empiricism', article: 'Empiricism' },
      { name: 'German idealism', article: 'German idealism', parents: ['Rationalism', 'Empiricism'] },
      { name: 'Transcendentalism', article: 'Transcendentalism', parents: ['German idealism'] },
      { name: 'Utilitarianism', article: 'Utilitarianism', parents: ['Empiricism'] },
      { name: 'Positivism', article: 'Positivism', parents: ['Empiricism'] },
      { name: 'Pragmatism', article: 'Pragmatism', parents: ['Empiricism'] },
      { name: 'Analytic philosophy', article: 'Analytic philosophy', parents: ['Empiricism'] },
      { name: 'Logical positivism', article: 'Logical positivism', parents: ['Analytic philosophy', 'Positivism'] },
      { name: 'Phenomenology', article: 'Phenomenology (philosophy)' },
      { name: 'Existentialism', article: 'Existentialism', parents: ['Phenomenology'] },
      { name: 'Postmodernism', article: 'Postmodernism', parents: ['Existentialism'] },
      { name: 'Nihilism', article: 'Nihilism' },
    ],
  },
  {
    id: 'eastern',
    name: 'Eastern philosophy',
    article: 'Eastern philosophy',
    color: '#e6b4b4',
    figures: [
      { name: 'Vedanta', article: 'Vedanta' },
      { name: 'Advaita Vedanta', article: 'Advaita Vedanta', parents: ['Vedanta'] },
      { name: 'Samkhya', article: 'Samkhya' },
      { name: 'Yoga', article: 'Yoga (philosophy)', parents: ['Samkhya'] },
      { name: 'Nyaya', article: 'Nyaya' },
      { name: 'Buddhist philosophy', article: 'Buddhist philosophy' },
      { name: 'Madhyamaka', article: 'Madhyamaka', parents: ['Buddhist philosophy'] },
      { name: 'Zen', article: 'Zen', parents: ['Buddhist philosophy'] },
      { name: 'Confucianism', article: 'Confucianism' },
      { name: 'Neo-Confucianism', article: 'Neo-Confucianism', parents: ['Confucianism'] },
      { name: 'Taoism', article: 'Taoism' },
      { name: 'Legalism', article: 'Legalism (Chinese philosophy)' },
      { name: 'Mohism', article: 'Mohism' },
      { name: 'Bushido', article: 'Bushido', parents: ['Zen', 'Neo-Confucianism'] },
    ],
  },
  {
    id: 'religions',
    name: 'Religions',
    article: 'Religion',
    color: '#c9b6ff',
    figures: [
      { name: 'Judaism', article: 'Judaism' },
      { name: 'Christianity', article: 'Christianity', parents: ['Judaism'] },
      { name: 'Catholicism', article: 'Catholic Church', parents: ['Christianity'] },
      { name: 'Eastern Orthodoxy', article: 'Eastern Orthodox Church', parents: ['Christianity'] },
      { name: 'Protestantism', article: 'Protestantism', parents: ['Catholicism'] },
      { name: 'Anglicanism', article: 'Anglicanism', parents: ['Catholicism'] },
      { name: 'Islam', article: 'Islam' },
      { name: 'Sunni Islam', article: 'Sunni Islam', parents: ['Islam'] },
      { name: 'Shia Islam', article: 'Shia Islam', parents: ['Islam'] },
      { name: 'Sufism', article: 'Sufism', parents: ['Islam'] },
      { name: 'Baháʼí Faith', article: 'Baháʼí Faith', parents: ['Shia Islam'] },
      { name: 'Zoroastrianism', article: 'Zoroastrianism' },
      { name: 'Vedic religion', article: 'Historical Vedic religion' },
      { name: 'Hinduism', article: 'Hinduism', parents: ['Vedic religion'] },
      { name: 'Śramaṇa', article: 'Śramaṇa' },
      { name: 'Buddhism', article: 'Buddhism', parents: ['Śramaṇa'] },
      { name: 'Theravada', article: 'Theravada', parents: ['Buddhism'] },
      { name: 'Mahayana', article: 'Mahayana', parents: ['Buddhism'] },
      { name: 'Vajrayana', article: 'Vajrayana', parents: ['Mahayana'] },
      { name: 'Jainism', article: 'Jainism', parents: ['Śramaṇa'] },
      { name: 'Sikhism', article: 'Sikhism' },
      { name: 'Shinto', article: 'Shinto' },
    ],
  },
]
