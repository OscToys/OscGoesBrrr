import { ipcRenderer } from 'electron';
import * as ReactDOM from 'react-dom/client';

// @ts-ignore
import style1 from './bootstrap.css';
// @ts-ignore
import style2 from './styles.scss';
import Main from "./components/Main";
import React from "react";
import createCache from "@emotion/cache";
import {CacheProvider} from "@emotion/react";
import {createTheme, CssBaseline, ThemeProvider} from "@mui/material";

window.addEventListener('DOMContentLoaded', async () => {
  style1.use();
  style2.use();
  const div = document.createElement("div");
  div.id = "maindiv";
  document.body.appendChild(div);
  const cache = createCache({
    key: 'mui',
    container: document.head ?? document.body,
  });
  const theme = createTheme({
    palette: {
      mode: 'dark',
      primary: {main: '#5fa3ff'},
      success: {main: '#2e7d32'},
    },
  });
  const root = ReactDOM.createRoot(div);
  root.render(React.createElement(
      CacheProvider,
      {value: cache},
      React.createElement(
          ThemeProvider,
          {theme},
          React.createElement(CssBaseline),
          React.createElement(Main),
      ),
  ));
});
