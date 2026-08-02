import styled from 'styled-components';

/** Official USDC mark, sourced from Wikimedia Commons (CC BY-SA 4.0, via Circle). */
export const UsdcIcon = styled.img.attrs({
  src: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Circle_USDC_Logo.svg',
  alt: 'USDC',
})`
  height: 1em;
  width: 1em;
  vertical-align: -0.15em;
  object-fit: contain;
`;
