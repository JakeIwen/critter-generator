import './style.css';
import { mountStudio } from './studio.js';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme();
mountStudio();
mountThemeToggle(document.getElementById('theme-toggle'));
