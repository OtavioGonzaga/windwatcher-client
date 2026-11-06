//! Windwatcher patch: do not mistake an unsuccessful durable commit for success.
pub(crate) fn check_commit(committed: bool) -> Result<(), ()> {
    if committed { Ok(()) } else { Err(()) }
}

#[cfg(test)]
mod tests {
    #[test]
    fn failed_commit_is_not_success() {
        assert!(super::check_commit(true).is_ok());
        assert!(super::check_commit(false).is_err());
    }
}
