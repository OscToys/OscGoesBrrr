import { ipcRenderer } from 'electron';
import * as ReactDOM from 'react-dom/client';

// @ts-ignore
import style from './styles.scss';
// @ts-ignore
import style2 from "@fortawesome/fontawesome-svg-core/styles.css";
import Main from "./components/Main";
import React from "react";

window.addEventListener('DOMContentLoaded', async () => {
  style.use();
  style2.use();
  const div = document.createElement("div");
  div.id = "maindiv";
  document.body.appendChild(div);
  const root = ReactDOM.createRoot(div);
  root.render(React.createElement(Main));
});
