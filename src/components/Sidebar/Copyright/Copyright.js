// @flow strict
import React from "react";
import styles from "./Copyright.module.scss";

type Props = {
  copyright: string,
};

const Copyright = ({ copyright }: Props) => (
  <div className={styles["copyright"]}>
    {copyright}
    <div className={styles["support"]}>
      <a href="https://ko-fi.com/G2G01SD6G" target="_blank">
        <img
          height="36"
          src="https://cdn.ko-fi.com/cdn/kofi3.png?v=2"
          border="0"
          alt="Buy Me a Coffee at ko-fi.com"
        />
      </a>
    </div>
  </div>
);

export default Copyright;
