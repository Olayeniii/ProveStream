import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  html, body, #root {
    height: 100%;
  }

  body {
    margin: 0;
    background: ${(props) => props.theme.colors.background};
    color: ${(props) => props.theme.colors.text};
    font-family: ${(props) => props.theme.fontFamily};
    -webkit-font-smoothing: antialiased;
  }

  code, pre {
    font-family: ${(props) => props.theme.monoFontFamily};
  }

  a {
    color: inherit;
  }

  button {
    font-family: inherit;
  }
`;
