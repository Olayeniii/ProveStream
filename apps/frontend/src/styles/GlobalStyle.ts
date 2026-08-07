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

  /*
   * Browser-owned surfaces (selection, focus, scrollbar) ship with generic
   * defaults that belong to no design system — theming them is the cheapest
   * signal a page was actually built, not assembled from a template.
   */
  ::selection {
    background: ${(props) => props.theme.colors.primary}33;
    color: ${(props) => props.theme.colors.text};
  }

  :focus-visible {
    outline: 2px solid ${(props) => props.theme.colors.primary};
    outline-offset: 2px;
  }

  * {
    scrollbar-color: ${(props) => props.theme.colors.slate}66 transparent;
    scrollbar-width: thin;
  }

  *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  *::-webkit-scrollbar-track {
    background: transparent;
  }

  *::-webkit-scrollbar-thumb {
    background: ${(props) => props.theme.colors.slate}66;
    border-radius: 999px;
    border: 2px solid ${(props) => props.theme.colors.background};
  }
`;
