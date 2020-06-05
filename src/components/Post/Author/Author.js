// @flow strict
import React from "react";
import { getContactHref } from "../../../utils";
import styles from "./Author.module.scss";
import { useSiteMetadata } from "../../../hooks";

const Author = () => {
  const { author } = useSiteMetadata();

  return (
    <div className={styles["author"]}>
      <p className={styles["author__bio"]}>
        {author.name} is an {author.bio} &nbsp;
        <a
          className={styles["author__bio-twitter"]}
          href={getContactHref("twitter", author.contacts.twitter)}
          rel="noopener noreferrer"
          target="_blank"
        >
          Follow him on Twitter
        </a>
      </p>
    </div>
  );
};

export default Author;
