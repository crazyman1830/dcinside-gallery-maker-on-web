import React from 'react';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  faArrowLeft,
  faBookmark,
  faCheck,
  faCheckCircle,
  faChevronDown,
  faClock,
  faCogs,
  faCommentDots,
  faComments as faSolidComments,
  faCrown,
  faExclamationCircle,
  faExclamationTriangle,
  faFileImport,
  faFilm,
  faFolderOpen,
  faGhost,
  faGlobeAmericas,
  faIdCard,
  faImage,
  faInfoCircle,
  faLightbulb,
  faLink,
  faList,
  faLock,
  faMagic,
  faPaperPlane,
  faPen,
  faPenNib,
  faPencilAlt,
  faPlug,
  faQuestionCircle,
  faReply,
  faRobot,
  faRocket,
  faSave,
  faShieldAlt,
  faSlidersH,
  faStop,
  faThumbsDown,
  faThumbsUp,
  faTimes,
  faTrashAlt,
  faUndo,
  faUpload,
  faUser,
  faUserEdit,
  faUserSecret,
  faUserTag,
  faUsersCog,
} from '@fortawesome/free-solid-svg-icons';
import {
  faCommentDots as faRegularCommentDots,
  faComments,
  faEye,
  faGrinSquint,
  faSmile,
  faThumbsUp as faRegularThumbsUp,
} from '@fortawesome/free-regular-svg-icons';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';

/**
 * Icons are rendered straight from their path data, so only the definitions
 * listed here reach the bundle and an unknown name fails type checking.
 */
export const ICONS = {
  'fas fa-arrow-left': faArrowLeft,
  'fas fa-bookmark': faBookmark,
  'fas fa-check': faCheck,
  'fas fa-check-circle': faCheckCircle,
  'fas fa-chevron-down': faChevronDown,
  'fas fa-clock': faClock,
  'fas fa-cogs': faCogs,
  'fas fa-comment-dots': faCommentDots,
  'fas fa-comments': faSolidComments,
  'fas fa-crown': faCrown,
  'fas fa-exclamation-circle': faExclamationCircle,
  'fas fa-exclamation-triangle': faExclamationTriangle,
  'fas fa-file-import': faFileImport,
  'fas fa-film': faFilm,
  'fas fa-folder-open': faFolderOpen,
  'fas fa-ghost': faGhost,
  'fas fa-globe-americas': faGlobeAmericas,
  'fas fa-id-card': faIdCard,
  'fas fa-image': faImage,
  'fas fa-info-circle': faInfoCircle,
  'fas fa-lightbulb': faLightbulb,
  'fas fa-link': faLink,
  'fas fa-list': faList,
  'fas fa-lock': faLock,
  'fas fa-magic': faMagic,
  'fas fa-paper-plane': faPaperPlane,
  'fas fa-pen': faPen,
  'fas fa-pen-nib': faPenNib,
  'fas fa-pencil-alt': faPencilAlt,
  'fas fa-plug': faPlug,
  'fas fa-question-circle': faQuestionCircle,
  'fas fa-reply': faReply,
  'fas fa-robot': faRobot,
  'fas fa-rocket': faRocket,
  'fas fa-save': faSave,
  'fas fa-shield-alt': faShieldAlt,
  'fas fa-sliders-h': faSlidersH,
  'fas fa-stop': faStop,
  'fas fa-thumbs-down': faThumbsDown,
  'fas fa-thumbs-up': faThumbsUp,
  'fas fa-times': faTimes,
  'fas fa-trash-alt': faTrashAlt,
  'fas fa-undo': faUndo,
  'fas fa-upload': faUpload,
  'fas fa-user': faUser,
  'fas fa-user-edit': faUserEdit,
  'fas fa-user-secret': faUserSecret,
  'fas fa-user-tag': faUserTag,
  'fas fa-users-cog': faUsersCog,
  'far fa-comment-dots': faRegularCommentDots,
  'far fa-comments': faComments,
  'far fa-eye': faEye,
  'far fa-grin-squint': faGrinSquint,
  'far fa-smile': faSmile,
  'far fa-thumbs-up': faRegularThumbsUp,
  'fab fa-google': faGoogle,
} satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  icon: IconName;
  className?: string;
}

/** Decorative icon; give the surrounding control its own accessible name. */
export const Icon: React.FC<IconProps> = ({ icon, className }) => {
  const definition: IconDefinition | undefined = ICONS[icon];
  if (!definition) return null;
  const [width, height, , , pathData] = definition.icon;
  return (
    <svg
      className={className ? `svg-inline--fa ${className}` : 'svg-inline--fa'}
      viewBox={`0 0 ${width} ${height}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {(Array.isArray(pathData) ? pathData : [pathData]).map(path => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
};
