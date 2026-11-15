export const LOCK_TOOL = `
import errno, fcntl, os, sys, time

command, path, kind, mode = sys.argv[1:5]
extra = sys.argv[5:]

def take(descriptor, blocking):
    flag = fcntl.LOCK_EX if mode == 'ex' else fcntl.LOCK_SH
    if not blocking:
        flag |= fcntl.LOCK_NB
    if kind == 'flock':
        fcntl.flock(descriptor, flag)
    else:
        fcntl.lockf(descriptor, flag)

def touch(name, text=''):
    with open(name, 'w') as handle:
        handle.write(text)

descriptor = os.open(path, os.O_RDWR)
if command == 'hold':
    ready, release = extra
    take(descriptor, False)
    touch(ready)
    while not os.path.exists(release):
        time.sleep(0.05)
elif command == 'try':
    try:
        take(descriptor, False)
        print('ACQUIRED')
    except OSError as failure:
        print(errno.errorcode.get(failure.errno, str(failure.errno)))
elif command == 'wait':
    waiting, acquired = extra
    touch(waiting)
    take(descriptor, True)
    touch(acquired, repr(time.time()))
else:
    raise SystemExit('unknown command ' + command)
`;

export const INSERT_TOOL = `
import sqlite3, sys

database, who, count = sys.argv[1], sys.argv[2], int(sys.argv[3])
connection = sqlite3.connect(database, timeout=300, isolation_level=None)
for number in range(count):
    connection.execute('begin immediate')
    connection.execute('insert into rows(who, number) values (?, ?)', (who, number))
    connection.execute('commit')
connection.close()
`;

export const EDIT_TOOL = `
import os, sys, time

path, content, ready, go, done = sys.argv[1:6]
descriptor = os.open(path, os.O_RDWR)
open(ready, 'w').close()
while not os.path.exists(go):
    time.sleep(0.05)
with open(content, 'rb') as source:
    data = source.read()
os.ftruncate(descriptor, 0)
written = 0
while written < len(data):
    written += os.pwrite(descriptor, data[written:], written)
os.fsync(descriptor)
os.close(descriptor)
open(done, 'w').close()
`;

export const WRITER_TOOL = `
import os, sys, time

directory, big_source, ready, go, stop, log = sys.argv[1:7]
FIRST_BATCH = 20

def content(number):
    return ('file %d\\n' % number) * 50

def append(line):
    with open(log, 'a') as handle:
        handle.write(line + '\\n')

with open(big_source, 'rb') as source:
    data = source.read()
half = len(data) // 2
big = os.open(os.path.join(directory, 'open.bin'), os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o644)
os.pwrite(big, data[:half], 0)

def create(number):
    name = 'f%d' % number
    try:
        with open(os.path.join(directory, name), 'w') as handle:
            handle.write(content(number))
        append(name)
    except FileNotFoundError:
        append('!' + name)

number = 0
while number < FIRST_BATCH:
    create(number)
    number += 1
open(ready, 'w').close()
finished_big = False
while not os.path.exists(stop):
    if not finished_big and os.path.exists(go):
        os.pwrite(big, data[half:], half)
        os.fsync(big)
        os.close(big)
        finished_big = True
    create(number)
    number += 1
    time.sleep(0.02)
if not finished_big:
    os.pwrite(big, data[half:], half)
    os.fsync(big)
    os.close(big)
`;

export function writerContent(number: number): string {
  return `file ${String(number)}\n`.repeat(50);
}
