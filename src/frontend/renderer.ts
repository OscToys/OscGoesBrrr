import { ipcRenderer } from 'electron';
import * as ReactDOM from 'react-dom/client';

// @ts-ignore
import style1 from './bootstrap.css';
// @ts-ignore
import style2 from './styles.css';
import Main from "./components/Main";
import React from "react";

window.addEventListener('DOMContentLoaded', async () => {
  style1.use();
  style2.use();
  const div = document.createElement("div");
  div.id = "maindiv";
  document.body.appendChild(div);
  const root = ReactDOM.createRoot(div);
  root.render(React.createElement(Main));
});
