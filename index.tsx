import React from 'react';
import ReactDOM from 'react-dom/client';
import { config, dom, library } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import {
  faArrowLeft,
  faBookmark,
  faCheck,
  faCheckCircle,
  faChevronDown,
  faCogs,
  faCommentDots,
  faCrown,
  faExclamationCircle,
  faExclamationTriangle,
  faExpand,
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
  faPlay,
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
  faUpload,
  faUser,
  faUserEdit,
  faUserSecret,
  faUserTag,
  faUsersCog,
  faVolumeUp,
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
import App from './App';
import './index.css';

config.autoAddCss = false;
// Keep React's <i> host nodes in place. Replacing them outright makes React's
// later unmounts fail because FontAwesome has removed a node React still owns.
config.autoReplaceSvg = 'nest';
library.add(
  faArrowLeft,
  faBookmark,
  faCheck,
  faCheckCircle,
  faChevronDown,
  faCogs,
  faCommentDots,
  faCrown,
  faExclamationCircle,
  faExclamationTriangle,
  faExpand,
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
  faPlay,
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
  faUpload,
  faUser,
  faUserEdit,
  faUserSecret,
  faUserTag,
  faUsersCog,
  faVolumeUp,
  faRegularCommentDots,
  faComments,
  faEye,
  faGrinSquint,
  faSmile,
  faRegularThumbsUp,
  faGoogle,
);
dom.watch();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
