import * as ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.css';
import './styles.scss';
import Main from "./components/Main";
import React from "react";
import createCache from "@emotion/cache";
import {CacheProvider} from "@emotion/react";
import {createTheme, CssBaseline, ThemeProvider} from "@mui/material";
import {Provider as JotaiProvider} from "jotai";

window.addEventListener('DOMContentLoaded', () => {
  const div = document.querySelector<HTMLDivElement>('#maindiv');
  if (!div) throw new Error('Missing renderer mount point');
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
      React.createElement(JotaiProvider,
          null,
          React.createElement(
              ThemeProvider,
              {theme},
              React.createElement(CssBaseline),
              React.createElement(Main),
          ),
      ),
  ));
});
