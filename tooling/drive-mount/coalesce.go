package main

func coalesced(run func()) func() {
	wake := make(chan struct{}, 1)
	go func() {
		for range wake {
			run()
		}
	}()
	return func() {
		select {
		case wake <- struct{}{}:
		default:
		}
	}
}
